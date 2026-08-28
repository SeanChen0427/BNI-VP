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

async function voterKey(token: string, personId: string) {
  return (await sha256(`${token}:${personId}`)).slice(0, 32);
}

function publicStatus(call: any) {
  if (["revoked", "expired"].includes(call.status)) return call.status;
  if (new Date(call.deadline_at).getTime() <= Date.now()) return "expired";
  return call.status;
}

async function findCall(token: string) {
  const tokenHash = await sha256(token);
  const rows = await db(
    `case_vote_calls?token_sha256=eq.${tokenHash}&is_test=eq.false&environment=eq.production&select=id,snapshot_id,case_type,applicant_snapshot,profession_snapshot,deadline_at,status&limit=1`,
  );
  return rows?.[0] || null;
}

async function ballotState(call: any, token: string) {
  let status = publicStatus(call);
  if (status === "expired" && call.status !== "expired") {
    await db(`case_vote_calls?id=eq.${call.id}&status=in.(awaiting_reply,replying,replied,reply_failed)`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "expired" }),
    }).catch(() => undefined);
  }
  const voters = await db(
    `case_vote_call_voters?call_id=eq.${call.id}&is_recused=eq.false&select=person_id,display_name_snapshot,role&order=display_name_snapshot.asc`,
  );
  const votes = await db(`votes?snapshot_id=eq.${call.snapshot_id}&select=voter_person_id`);
  const voted = new Set((votes || []).map((item: any) => item.voter_person_id));
  return {
    caseType: call.case_type,
    applicant: call.applicant_snapshot,
    profession: call.profession_snapshot,
    deadlineAt: call.deadline_at,
    status,
    voteCount: voted.size,
    voters: await Promise.all((voters || []).map(async (item: any) => ({
      key: await voterKey(token, item.person_id),
      name: item.display_name_snapshot,
      role: item.role,
      hasVoted: voted.has(item.person_id),
    }))),
  };
}

function safeErrorStatus(error: any) {
  const message = String(error?.message || "");
  if (/找不到|不在.*名單/.test(message)) return 404;
  if (/已截止|已完成|尚未|狀態已更新|不能/.test(message)) return 409;
  return 400;
}

Deno.serve(async (request) => {
  const origin = corsOrigin(request);
  if (request.method === "OPTIONS") {
    return origin ? new Response(null, { status: 204, headers: responseHeaders(origin) }) : json(403, { message: "Origin not allowed" });
  }
  if (!origin) return json(403, { message: "Origin not allowed" });
  if (!supabaseUrl || !serviceKey) return json(503, { message: "投票服務尚未設定" }, origin);
  if (!["GET", "POST"].includes(request.method)) return json(405, { message: "Method not allowed" }, origin);

  try {
    let token = "";
    let voter = "";
    let choice = "";
    if (request.method === "GET") {
      token = validToken(new URL(request.url).searchParams.get("t"));
    } else {
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > 4096) return json(413, { message: "Payload too large" }, origin);
      const body = await request.json().catch(() => ({}));
      token = validToken(body?.token);
      voter = String(body?.voterKey || "").trim();
      choice = String(body?.choice || "").trim();
    }
    if (!token) return json(400, { message: "投票連結格式不正確" }, origin);
    const call = await findCall(token);
    if (!call) return json(404, { message: "找不到這份投票，請由最新 LINE 圖卡重新進入" }, origin);

    if (request.method === "POST") {
      if (!/^[0-9a-f]{32}$/.test(voter) || !["approve", "reject"].includes(choice)) {
        return json(400, { message: "請選擇自己的姓名與投票選項" }, origin);
      }
      if (publicStatus(call) !== "replied") {
        return json(409, { message: publicStatus(call) === "expired" ? "投票已截止" : "投票尚未由 LINE Bot 開放" }, origin);
      }
      const candidates = await db(
        `case_vote_call_voters?call_id=eq.${call.id}&is_recused=eq.false&select=person_id`,
      );
      let personId = "";
      for (const candidate of candidates || []) {
        if (await voterKey(token, candidate.person_id) === voter) {
          personId = candidate.person_id;
          break;
        }
      }
      if (!personId) return json(404, { message: "這個姓名不在本次投票資格名單中" }, origin);
      await db("rpc/edge_cast_public_case_vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_call_id: call.id, p_voter_person_id: personId, p_choice: choice }),
      });
    }
    return json(200, await ballotState(call, token), origin);
  } catch (error) {
    console.error("Public vote request failed", String((error as Error)?.message || error));
    return json(safeErrorStatus(error), { message: String((error as Error)?.message || "投票服務暫時無法使用").slice(0, 300) }, origin);
  }
});
