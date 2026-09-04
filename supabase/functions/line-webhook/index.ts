import {
  collectGroupEvents,
  collectReplyOpportunityEvents,
  collectVoteCallEvents,
  resolveLineWebhookChannel,
} from "./domain.mjs";
import { LINE_OA_CHANNELS } from "../_shared/line-channel-domain.mjs";
import {
  buildVoteCallReplyMessages,
  extractVoteCallToken,
  extractVoteCallUrl,
  normalizeVoteCallText,
  voteCallFingerprintSource,
} from "../_shared/case-vote-call-domain.mjs";
import {
  buildFeedbackCallReplyMessages,
  extractFeedbackCallToken,
  extractFeedbackCallUrl,
  feedbackCallFingerprintSource,
  normalizeFeedbackCallText,
} from "../_shared/case-feedback-call-domain.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const viceChairAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const committeeAccessToken = Deno.env.get("LINE_COMMITTEE_CHANNEL_ACCESS_TOKEN") || "";
const channelSecrets = [
  { channel: LINE_OA_CHANNELS.VICE_CHAIR, secret: Deno.env.get("LINE_CHANNEL_SECRET") || "" },
  { channel: LINE_OA_CHANNELS.COMMITTEE, secret: Deno.env.get("LINE_COMMITTEE_CHANNEL_SECRET") || "" },
].filter(item => item.secret);

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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
    try { message = JSON.parse(text)?.message || message; } catch { /* keep safe status */ }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return text ? JSON.parse(text) : null;
}

async function recordGroupEvent(event: { groupId: string; kind: string; occurredAt: string }, oaChannel: string) {
  const encoded = encodeURIComponent(event.groupId);
  const existingRows = await db(`line_group_targets?oa_channel=eq.${encodeURIComponent(oaChannel)}&line_group_id=eq.${encoded}&select=id,status&limit=1`);
  const existing = existingRows?.[0];
  if (event.kind === "leave") {
    if (!existing) return;
    await db(`line_group_targets?id=eq.${existing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "disabled", left_at: event.occurredAt, last_event_at: event.occurredAt }),
    });
    return;
  }
  if (!existing) {
    await db("line_group_targets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ oa_channel: oaChannel, line_group_id: event.groupId, last_event_at: event.occurredAt }),
    });
    return;
  }
  const patch = existing.status === "disabled"
    ? { status: "discovered", purpose: null, route_key: null, verified_by: null, verified_at: null, left_at: null, last_event_at: event.occurredAt }
    : { last_event_at: event.occurredAt, left_at: null };
  await db(`line_group_targets?id=eq.${existing.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function finishPendingAnnouncement(id: string, webhookEventId: string, patch: Record<string, unknown>) {
  const eventFilter = webhookEventId ? `&webhook_event_id=eq.${encodeURIComponent(webhookEventId)}` : "&webhook_event_id=is.null";
  await db(`pending_announcements?id=eq.${id}&status=eq.replying${eventFilter}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function processReplyOpportunityEvent(event: {
  groupId: string;
  replyToken: string;
  webhookEventId: string;
  lineMessageId: string;
}) {
  if (!viceChairAccessToken) return false;
  const targets = await db(
    `line_group_targets?oa_channel=eq.vice_chair&line_group_id=eq.${encodeURIComponent(event.groupId)}`
      + `&status=eq.active&purpose=eq.${encodeURIComponent("production")}`
      + "&route_key=eq.exchange&delivery_strategy=eq.opportunistic&select=id&limit=1",
  );
  const target = targets?.[0];
  if (!target) return false;
  const now = new Date();
  const nowIso = now.toISOString();
  const rows = await db(
    `pending_announcements?group_target_id=eq.${target.id}&oa_channel=eq.vice_chair&status=eq.pending`
      + `&window_start=lte.${encodeURIComponent(nowIso)}&window_end=gte.${encodeURIComponent(nowIso)}`
      + "&select=*&order=created_at.asc&limit=1",
  );
  const announcement = rows?.[0];
  if (!announcement || (event.webhookEventId && announcement.webhook_event_id === event.webhookEventId)) return false;
  let claimed;
  try {
    claimed = await db(`pending_announcements?id=eq.${announcement.id}&status=eq.pending`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "replying",
        reply_attempt_count: Number(announcement.reply_attempt_count || 0) + 1,
        reply_claimed_at: nowIso,
        webhook_event_id: event.webhookEventId || null,
        line_message_id: event.lineMessageId || null,
        failed_at: null,
        error_code: null,
        error_message: null,
      }),
    });
  } catch (error) {
    if (Number((error as any)?.status) === 409 || /duplicate key/i.test(String((error as Error)?.message))) return false;
    throw error;
  }
  if (!claimed?.[0]) return false;
  let response: Response;
  try {
    response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viceChairAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyToken: event.replyToken, messages: [claimed[0].message_payload] }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch (error) {
    await finishPendingAnnouncement(claimed[0].id, event.webhookEventId, {
      status: "pending",
      reply_claimed_at: null,
      failed_at: new Date().toISOString(),
      error_code: "NETWORK",
      error_message: String((error as Error)?.message || error).slice(0, 1000),
    });
    return true;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await finishPendingAnnouncement(claimed[0].id, event.webhookEventId, {
      status: "pending",
      reply_claimed_at: null,
      failed_at: new Date().toISOString(),
      line_request_id: response.headers.get("x-line-request-id") || null,
      error_code: `HTTP_${response.status}`,
      error_message: String(payload?.message || `LINE HTTP ${response.status}`).slice(0, 1000),
    });
    return true;
  }
  await finishPendingAnnouncement(claimed[0].id, event.webhookEventId, {
    status: "delivered",
    delivery_mode: "reply",
    reply_claimed_at: null,
    delivered_at: new Date().toISOString(),
    failed_at: null,
    error_code: null,
    error_message: null,
    line_request_id: response.headers.get("x-line-request-id") || null,
    line_message_id: payload?.sentMessages?.[0]?.id || event.lineMessageId || null,
  });
  return true;
}

async function finishVoteCall(callId: string, patch: Record<string, unknown>) {
  await db(`case_vote_calls?id=eq.${callId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function finishFeedbackCall(callId: string, patch: Record<string, unknown>) {
  await db(`case_feedback_calls?id=eq.${callId}&status=eq.replying`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function processFeedbackCallEvent(event: {
  groupId: string;
  text: string;
  replyToken: string;
  webhookEventId: string;
  lineMessageId: string;
}) {
  if (!committeeAccessToken) return;
  const token = extractFeedbackCallToken(event.text);
  const feedbackUrl = extractFeedbackCallUrl(event.text);
  if (!token || !feedbackUrl) return;
  const targets = await db(
    `line_group_targets?oa_channel=eq.committee&line_group_id=eq.${encodeURIComponent(event.groupId)}&status=eq.active&route_key=eq.committee&select=id,purpose&limit=1`,
  );
  const target = targets?.[0];
  if (!target || !["test", "production"].includes(String(target.purpose || ""))) return;
  const [tokenHash, messageHash] = await Promise.all([
    sha256Text(token),
    sha256Text(feedbackCallFingerprintSource(normalizeFeedbackCallText(event.text))),
  ]);
  const calls = await db(
    `case_feedback_calls?token_sha256=eq.${tokenHash}&message_sha256=eq.${messageHash}&group_target_id=eq.${target.id}&environment=eq.${target.purpose}&status=in.(awaiting_reply,reply_failed)&select=*&limit=1`,
  );
  const call = calls?.[0];
  if (!call || call.environment !== target.purpose) return;
  const claimed = await db(
    `case_feedback_calls?id=eq.${call.id}&status=in.(awaiting_reply,reply_failed)`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "replying",
        webhook_event_id: event.webhookEventId || null,
        line_message_id: event.lineMessageId || null,
        failed_at: null,
        error_message: null,
      }),
    },
  );
  if (!claimed?.[0]) return;
  const messages = buildFeedbackCallReplyMessages({
    caseType: call.case_type,
    applicant: call.applicant_snapshot,
    profession: call.profession_snapshot,
    feedbackUrl,
  });
  let response: Response;
  try {
    response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${committeeAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyToken: event.replyToken, messages }),
    });
  } catch (error) {
    await finishFeedbackCall(call.id, {
      status: "reply_failed",
      failed_at: new Date().toISOString(),
      error_message: String((error as Error)?.message || error).slice(0, 1000),
    });
    return;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await finishFeedbackCall(call.id, {
      status: "reply_failed",
      failed_at: new Date().toISOString(),
      line_request_id: response.headers.get("x-line-request-id") || null,
      error_message: String(payload?.message || `LINE HTTP ${response.status}`).slice(0, 1000),
    });
    return;
  }
  await finishFeedbackCall(call.id, {
    status: "replied",
    replied_at: new Date().toISOString(),
    failed_at: null,
    error_message: null,
    line_request_id: response.headers.get("x-line-request-id") || null,
    line_message_id: payload?.sentMessages?.[1]?.id || payload?.sentMessages?.[0]?.id || event.lineMessageId || null,
  });
}

async function processVoteCallEvent(event: {
  groupId: string;
  text: string;
  replyToken: string;
  webhookEventId: string;
  lineMessageId: string;
}) {
  if (!committeeAccessToken) return;
  const token = extractVoteCallToken(event.text);
  const ballotUrl = extractVoteCallUrl(event.text);
  if (!token || !ballotUrl) return;
  const targets = await db(
    `line_group_targets?oa_channel=eq.committee&line_group_id=eq.${encodeURIComponent(event.groupId)}&status=eq.active&route_key=eq.committee&select=id,purpose&limit=1`,
  );
  const target = targets?.[0];
  if (!target || !["test", "production"].includes(String(target.purpose || ""))) return;
  const [tokenHash, messageHash] = await Promise.all([
    sha256Text(token),
    sha256Text(voteCallFingerprintSource(normalizeVoteCallText(event.text))),
  ]);
  const calls = await db(
    `case_vote_calls?token_sha256=eq.${tokenHash}&message_sha256=eq.${messageHash}&group_target_id=eq.${target.id}&is_test=eq.false&environment=eq.${target.purpose}&status=in.(awaiting_reply,reply_failed)&select=*&limit=1`,
  );
  const call = calls?.[0];
  if (!call || call.environment !== target.purpose) return;
  if (new Date(call.deadline_at).getTime() <= Date.now()) {
    await finishVoteCall(call.id, { status: "expired", error_message: "投票呼喚貼出時已超過截止時間" });
    return;
  }
  const claimed = await db(
    `case_vote_calls?id=eq.${call.id}&status=in.(awaiting_reply,reply_failed)`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "replying",
        webhook_event_id: event.webhookEventId || null,
        line_message_id: event.lineMessageId || null,
        failed_at: null,
        error_message: null,
      }),
    },
  );
  if (!claimed?.[0]) return;
  const messages = buildVoteCallReplyMessages({
    caseType: call.case_type,
    applicant: call.applicant_snapshot,
    profession: call.profession_snapshot,
    deadlineAt: call.deadline_at,
    ballotUrl,
  });
  let response: Response;
  try {
    response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${committeeAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyToken: event.replyToken, messages }),
    });
  } catch (error) {
    await finishVoteCall(call.id, {
      status: "reply_failed",
      failed_at: new Date().toISOString(),
      error_message: String((error as Error)?.message || error).slice(0, 1000),
    });
    return;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await finishVoteCall(call.id, {
      status: "reply_failed",
      failed_at: new Date().toISOString(),
      line_request_id: response.headers.get("x-line-request-id") || null,
      error_message: String(payload?.message || `LINE HTTP ${response.status}`).slice(0, 1000),
    });
    return;
  }
  await finishVoteCall(call.id, {
    status: "replied",
    replied_at: new Date().toISOString(),
    failed_at: null,
    error_message: null,
    line_request_id: response.headers.get("x-line-request-id") || null,
    line_message_id: payload?.sentMessages?.[1]?.id || payload?.sentMessages?.[0]?.id || event.lineMessageId || null,
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { message: "Method not allowed" });
  if (!supabaseUrl || !serviceKey || !channelSecrets.length) {
    return json(503, { message: "LINE webhook is not configured" });
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 1024 * 1024) return json(413, { message: "Payload too large" });
  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) return json(413, { message: "Payload too large" });
  const signature = request.headers.get("x-line-signature") || "";
  const oaChannel = await resolveLineWebhookChannel(rawBody, signature, channelSecrets);
  if (!oaChannel) {
    return json(401, { message: "Invalid signature" });
  }
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json(400, { message: "Invalid JSON" }); }
  try {
    // 普通聊天內容不落地。副主席秘書Bot只使用當次 message 事件的
    // replyToken 投遞已排程公告；會員委員秘書Bot只解析精準命中的案件呼喚。
    await Promise.all(collectGroupEvents(payload).map(event => recordGroupEvent(event, oaChannel)));
    if (oaChannel === LINE_OA_CHANNELS.VICE_CHAIR) {
      // 同一 webhook request 最多投遞一則待發公告，避免多事件或多待發項造成洗版。
      for (const opportunity of collectReplyOpportunityEvents(payload)) {
        if (await processReplyOpportunityEvent(opportunity)) break;
      }
    } else if (oaChannel === LINE_OA_CHANNELS.COMMITTEE) {
      // 委員會的回饋／投票呼喚只有 Token 與完整雜湊相符才會回覆。
      const callEvents = collectVoteCallEvents(payload);
      await Promise.all(callEvents.flatMap(event => [
        processFeedbackCallEvent(event),
        processVoteCallEvent(event),
      ]));
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error("LINE webhook persistence failed", String((error as Error)?.message || error));
    return json(500, { message: "Webhook persistence failed" });
  }
});
