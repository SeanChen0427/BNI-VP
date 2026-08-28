const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigins = new Set([
  "https://seanchen0427.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const encoder = new TextEncoder();

function corsOrigin(request: Request) {
  const origin = request.headers.get("origin") || "";
  return allowedOrigins.has(origin) ? origin : "";
}

function responseHeaders(origin = "") {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "vary": "Origin",
    } : {}),
  };
}

function json(status: number, payload: unknown, origin = "") {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(origin) });
}

async function db(path: string, options: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `Supabase HTTP ${response.status}`;
    try { message = JSON.parse(text)?.message || message; } catch { /* safe fallback */ }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return text ? JSON.parse(text) : null;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function validToken(value: unknown) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

async function responderKey(token: string, personId: string) {
  return (await sha256(`${token}:${personId}`)).slice(0, 32);
}

async function findCall(token: string) {
  const tokenHash = await sha256(token);
  const rows = await db(
    `case_feedback_calls?token_sha256=eq.${tokenHash}&environment=in.(test,production)`
      + "&select=id,task_id,case_id,case_type,applicant_snapshot,profession_snapshot,interview_date,lead_interviewer_snapshot,companion_interviewer_snapshot,status&limit=1",
  );
  return rows?.[0] || null;
}

async function callStatus(call: any) {
  if (call.status === "revoked") return "revoked";
  const rows = await db(`task_case_states?task_id=eq.${call.task_id}&select=workflow&limit=1`);
  const workflow = rows?.[0]?.workflow || {};
  if (workflow.closed || !workflow.wordSaved) return "revoked";
  return call.status;
}

async function feedbackState(call: any, token: string) {
  const status = await callStatus(call);
  const base = {
    caseType: call.case_type,
    applicant: call.applicant_snapshot,
    profession: call.profession_snapshot,
    interviewDate: call.interview_date,
    leadInterviewer: call.lead_interviewer_snapshot,
    companionInterviewer: call.companion_interviewer_snapshot,
    status,
    feedbackCount: 0,
    responders: [],
    feedback: [],
  };
  if (status !== "replied") return base;

  const [responders, feedbackRows] = await Promise.all([
    db(`case_feedback_call_responders?call_id=eq.${call.id}&select=person_id,display_name_snapshot,role&order=display_name_snapshot.asc`),
    db(`case_feedback?case_id=eq.${call.case_id}&select=author_person_id,submitted_by_person_id,body,submitted_at,updated_at&order=submitted_at.asc`),
  ]);
  const feedbackByPerson = new Map((feedbackRows || []).map((item: any) => [item.author_person_id, item]));
  const visibleResponders = await Promise.all((responders || []).map(async (item: any) => {
    const feedback = feedbackByPerson.get(item.person_id) as any;
    return {
      key: await responderKey(token, item.person_id),
      name: item.display_name_snapshot,
      role: item.role,
      hasFeedback: Boolean(feedback?.body),
      delegated: Boolean(feedback?.submitted_by_person_id && feedback.submitted_by_person_id !== item.person_id),
    };
  }));
  const roleByPerson = new Map((responders || []).map((item: any) => [item.person_id, item.role]));
  const nameByPerson = new Map((responders || []).map((item: any) => [item.person_id, item.display_name_snapshot]));
  const visibleFeedback = (feedbackRows || [])
    .filter((item: any) => nameByPerson.has(item.author_person_id) && String(item.body || "").trim())
    .map((item: any) => ({
      name: nameByPerson.get(item.author_person_id),
      role: roleByPerson.get(item.author_person_id),
      body: item.body,
      submittedAt: item.submitted_at,
      updatedAt: item.updated_at,
      delegated: Boolean(item.submitted_by_person_id && item.submitted_by_person_id !== item.author_person_id),
    }));
  return {
    ...base,
    feedbackCount: visibleFeedback.length,
    responders: visibleResponders,
    feedback: visibleFeedback,
  };
}

function safeErrorStatus(error: any) {
  const message = String(error?.message || "");
  if (/找不到|不在.*名單/.test(message)) return 404;
  if (/已結案|已完成|尚未|已鎖定|不能|無法/.test(message)) return 409;
  return 400;
}

Deno.serve(async (request) => {
  const origin = corsOrigin(request);
  if (request.method === "OPTIONS") {
    return origin ? new Response(null, { status: 204, headers: responseHeaders(origin) }) : json(403, { message: "Origin not allowed" });
  }
  if (!origin) return json(403, { message: "Origin not allowed" });
  if (!supabaseUrl || !serviceKey) return json(503, { message: "回饋服務尚未設定" }, origin);
  if (!["GET", "POST"].includes(request.method)) return json(405, { message: "Method not allowed" }, origin);

  try {
    let token = "";
    let responder = "";
    let feedback = "";
    if (request.method === "GET") {
      token = validToken(new URL(request.url).searchParams.get("f"));
    } else {
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > 16384) return json(413, { message: "Payload too large" }, origin);
      const rawBody = await request.text();
      if (encoder.encode(rawBody).byteLength > 16384) {
        return json(413, { message: "Payload too large" }, origin);
      }
      let body: any = {};
      try { body = JSON.parse(rawBody); } catch { /* invalid body handled below */ }
      token = validToken(body?.token);
      responder = String(body?.responderKey || "").trim();
      feedback = String(body?.feedback || "").trim();
    }
    if (!token) return json(400, { message: "回饋連結格式不正確" }, origin);
    const call = await findCall(token);
    if (!call) return json(404, { message: "找不到這份回饋表，請由最新 LINE 圖卡重新進入" }, origin);

    if (request.method === "POST") {
      if (!/^[0-9a-f]{32}$/.test(responder) || feedback.length < 1 || feedback.length > 5000) {
        return json(400, { message: "請選擇自己的姓名，並填寫 1 至 5,000 字回饋" }, origin);
      }
      if (await callStatus(call) !== "replied") {
        return json(409, { message: "回饋圖卡尚未由 LINE Bot 開放，或案件已結案" }, origin);
      }
      const candidates = await db(
        `case_feedback_call_responders?call_id=eq.${call.id}&select=person_id`,
      );
      let personId = "";
      for (const candidate of candidates || []) {
        if (await responderKey(token, candidate.person_id) === responder) {
          personId = candidate.person_id;
          break;
        }
      }
      if (!personId) return json(404, { message: "這個姓名不在本案回饋名單中" }, origin);
      await db("rpc/edge_save_public_case_feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_call_id: call.id,
          p_author_person_id: personId,
          p_body: feedback,
        }),
      });
    }
    return json(200, await feedbackState(call, token), origin);
  } catch (error) {
    console.error("Public feedback request failed", String((error as Error)?.message || error));
    return json(safeErrorStatus(error), { message: String((error as Error)?.message || "回饋服務暫時無法使用").slice(0, 300) }, origin);
  }
});
