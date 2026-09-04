import { buildLineMentionAllMessage } from "../app-api/line-message.mjs";
import {
  buildReminderFallbackMessages,
  isOpportunisticReminder,
  isRuleDue,
  opportunisticDeliveryWindow,
  reminderRouteKey,
  ruleDueDate,
} from "../_shared/line-reminder-domain.mjs";
import { LINE_OA_CHANNELS, lineChannelForRoute, normalizeLineChannel } from "../_shared/line-channel-domain.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cronSecret = Deno.env.get("LINE_REMINDER_CRON_SECRET") || "";
const FALLBACK_GRACE_MINUTES = 360;
const REPLY_CLAIM_TIMEOUT_MINUTES = 2;
const FALLBACK_CLAIM_TIMEOUT_MINUTES = 5;

function lineAccessToken(oaChannel: string) {
  if (oaChannel === LINE_OA_CHANNELS.COMMITTEE) {
    return Deno.env.get("LINE_COMMITTEE_CHANNEL_ACCESS_TOKEN") || "";
  }
  if (oaChannel === LINE_OA_CHANNELS.VICE_CHAIR) {
    return Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
  }
  return "";
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function db(path: string, options: RequestInit = {}) {
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  });
  const text = await result.text();
  let payload: any = null;
  if (text) payload = JSON.parse(text);
  if (!result.ok) throw Object.assign(new Error(payload?.message || payload?.error || `Supabase HTTP ${result.status}`), { status: result.status });
  return payload;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function patchDelivery(id: string, patch: Record<string, unknown>) {
  await db(`line_reminder_deliveries?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function patchAnnouncement(id: string, patch: Record<string, unknown>, statusFilter = "") {
  const filter = statusFilter ? `&status=${statusFilter}` : "";
  return db(`pending_announcements?id=eq.${id}${filter}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

async function claimDelivery(rule: any, target: any, dueDate: string) {
  const retryKey = crypto.randomUUID();
  const deliveryKey = `scheduled:${rule.reminder_key}:${dueDate}:${target.id}`;
  try {
    const rows = await db("line_reminder_deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        delivery_key: deliveryKey,
        reminder_key: rule.reminder_key,
        group_target_id: target.id,
        trigger_source: "scheduled",
        local_due_date: dueDate,
        message_sha256: await sha256(String(rule.message_template)),
        retry_key: retryKey,
      }),
    });
    return { ...rows[0], retry_key: retryKey };
  } catch (error) {
    if (Number((error as any)?.status) === 409 || /duplicate key/i.test(String((error as Error)?.message))) {
      const rows = await db(`line_reminder_deliveries?delivery_key=eq.${encodeURIComponent(deliveryKey)}&select=*&limit=1`);
      const existing = rows?.[0];
      if (!existing || existing.status === "sent" || Number(existing.attempt_count || 0) >= 3) return null;
      if (existing.status === "processing" && Date.now() - new Date(existing.requested_at).getTime() < 5 * 60 * 1000) return null;
      const updated = await db(`line_reminder_deliveries?id=eq.${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          status: "processing",
          attempt_count: Number(existing.attempt_count || 0) + 1,
          requested_at: new Date().toISOString(),
          sent_at: null,
          failed_at: null,
          error_code: null,
          error_message: null,
          line_request_id: null,
          line_message_id: null,
        }),
      });
      return updated?.[0] || null;
    }
    throw error;
  }
}

async function sendPushReminder(rule: any, target: any, now: Date) {
  const targetChannel = normalizeLineChannel(target.oa_channel);
  if (!targetChannel || lineChannelForRoute(target.route_key) !== targetChannel) return "wrong-channel";
  const lineToken = lineAccessToken(target.oa_channel);
  if (!lineToken) return "missing-channel-token";
  const dueDate = ruleDueDate(rule, now);
  if (!dueDate) return "not-due";
  const delivery = await claimDelivery(rule, target, dueDate);
  if (!delivery) return "duplicate";
  const content = String(rule.message_template || "").trim();
  const message = rule.mention_all ? buildLineMentionAllMessage(content) : { type: "text", text: content };
  try {
    const result = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lineToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": delivery.retry_key,
      },
      body: JSON.stringify({ to: target.line_group_id, messages: [message] }),
    });
    const payload = await result.json().catch(() => ({}));
    const acceptedRequestId = result.headers.get("x-line-accepted-request-id") || "";
    if (!result.ok && !(result.status === 409 && acceptedRequestId)) {
      const errorMessage = String(payload.message || `LINE HTTP ${result.status}`).slice(0, 1000);
      await patchDelivery(delivery.id, { status: "failed", failed_at: new Date().toISOString(), error_code: `HTTP_${result.status}`, error_message: errorMessage });
      return "failed";
    }
    await patchDelivery(delivery.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      line_request_id: result.headers.get("x-line-request-id") || acceptedRequestId || null,
      line_message_id: payload?.sentMessages?.[0]?.id || null,
    });
    return "sent";
  } catch (error) {
    const errorMessage = String((error as Error)?.message || error).slice(0, 1000);
    await patchDelivery(delivery.id, { status: "failed", failed_at: new Date().toISOString(), error_code: "NETWORK", error_message: errorMessage });
    return "failed";
  }
}

async function queueOpportunisticReminder(rule: any, target: any, now: Date) {
  const targetChannel = normalizeLineChannel(target.oa_channel);
  if (targetChannel !== LINE_OA_CHANNELS.VICE_CHAIR || target.route_key !== "exchange") return "wrong-channel";
  if (target.delivery_strategy !== "opportunistic") return "wrong-strategy";
  if (!lineAccessToken(targetChannel)) return "missing-channel-token";
  const windowMinutes = Number(target.opportunistic_window_minutes || 720);
  const window = opportunisticDeliveryWindow(rule, now, windowMinutes, FALLBACK_GRACE_MINUTES);
  if (!window) return "not-due";
  const deliveryKey = `scheduled-reply:${rule.reminder_key}:${window.localDueDate}:${target.id}`;
  const existingRows = await db(`pending_announcements?delivery_key=eq.${encodeURIComponent(deliveryKey)}&select=status&limit=1`);
  if (existingRows?.[0]) return `existing-${existingRows[0].status}`;
  const content = String(rule.message_template || "").trim();
  const message = rule.mention_all ? buildLineMentionAllMessage(content) : { type: "text", text: content };
  try {
    await db("pending_announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        delivery_key: deliveryKey,
        reminder_key: rule.reminder_key,
        group_target_id: target.id,
        oa_channel: targetChannel,
        trigger_source: "scheduled",
        local_due_date: window.localDueDate,
        scheduled_for: window.scheduledFor,
        window_start: window.windowStart,
        window_end: window.windowEnd,
        group_display_name: String(target.display_name || "富聯交流群").trim().slice(0, 200),
        message_text: content,
        message_payload: message,
        message_sha256: await sha256(JSON.stringify(message)),
      }),
    });
    return window.expired ? "queued-expired" : "queued";
  } catch (error) {
    if (Number((error as any)?.status) === 409 || /duplicate key/i.test(String((error as Error)?.message))) return "duplicate";
    throw error;
  }
}

async function recoverInterruptedClaims(now: Date) {
  const replyCutoff = new Date(now.getTime() - REPLY_CLAIM_TIMEOUT_MINUTES * 60_000).toISOString();
  const fallbackCutoff = new Date(now.getTime() - FALLBACK_CLAIM_TIMEOUT_MINUTES * 60_000).toISOString();
  await db(`pending_announcements?status=eq.replying&reply_claimed_at=lt.${encodeURIComponent(replyCutoff)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "pending",
      reply_claimed_at: null,
      error_code: "REPLY_TIMEOUT",
      error_message: "LINE Reply 處理逾時，已恢復等待下一則群組訊息",
    }),
  });
  await db(`pending_announcements?status=eq.fallback_processing&fallback_claimed_at=lt.${encodeURIComponent(fallbackCutoff)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "fallback_failed",
      fallback_claimed_at: null,
      failed_at: now.toISOString(),
      error_code: "BROADCAST_TIMEOUT",
      error_message: "LINE 好友群發處理逾時，系統將以同一 retry key 重試",
    }),
  });
}

async function expireManualTests(now: Date) {
  await db(`pending_announcements?trigger_source=eq.manual_test&status=eq.pending&window_end=lt.${encodeURIComponent(now.toISOString())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "expired", failed_at: now.toISOString(), error_code: "TEST_WINDOW_EXPIRED", error_message: "15 分鐘內沒有群組新訊息，本次回覆測試已結束" }),
  });
}

async function expireStaleScheduledAnnouncements(now: Date) {
  const cutoff = new Date(now.getTime() - FALLBACK_GRACE_MINUTES * 60_000).toISOString();
  await db(`pending_announcements?trigger_source=eq.scheduled&status=in.(pending,fallback_failed)&window_end=lt.${encodeURIComponent(cutoff)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "expired", failed_at: now.toISOString(), error_code: "FALLBACK_WINDOW_EXPIRED", error_message: "備援通知時限已過，請從工作台人工處理" }),
  });
}

async function claimFallback(row: any, now: Date) {
  const attempt = Number(row.fallback_attempt_count || 0) + 1;
  const claimed = await patchAnnouncement(row.id, {
    status: "fallback_processing",
    fallback_attempt_count: attempt,
    fallback_claimed_at: now.toISOString(),
    failed_at: null,
    error_code: null,
    error_message: null,
  }, "in.(pending,fallback_failed)");
  return claimed?.[0] ? { ...claimed[0], fallback_attempt_count: attempt } : null;
}

async function fallbackStillEligible(row: any) {
  const [targets, rules] = await Promise.all([
    db(
      `line_group_targets?id=eq.${row.group_target_id}&oa_channel=eq.vice_chair`
        + "&status=eq.active&purpose=eq.production&route_key=eq.exchange"
        + "&delivery_strategy=eq.opportunistic&select=id&limit=1",
    ),
    db(
      `line_reminder_rules?reminder_key=eq.${encodeURIComponent(row.reminder_key)}`
        + "&enabled=eq.true&select=reminder_key&limit=1",
    ),
  ]);
  return Boolean(targets?.[0] && rules?.[0]);
}

async function sendFallbackBroadcast(row: any, now: Date) {
  if (!await fallbackStillEligible(row)) {
    await patchAnnouncement(row.id, {
      status: "cancelled",
      error_code: "REMINDER_NO_LONGER_ACTIVE",
      error_message: "提醒規則或交流群設定已變更，未執行好友備援群發",
    }, "in.(pending,fallback_failed)");
    return "cancelled";
  }
  const claimed = await claimFallback(row, now);
  if (!claimed) return "already-claimed";
  const lineToken = lineAccessToken(LINE_OA_CHANNELS.VICE_CHAIR);
  if (!lineToken) {
    await patchAnnouncement(claimed.id, {
      status: "failed",
      fallback_claimed_at: null,
      failed_at: now.toISOString(),
      error_code: "MISSING_CHANNEL_TOKEN",
      error_message: "副主席秘書Bot Channel Access Token 尚未設定",
    });
    return "missing-channel-token";
  }
  const waitingHours = Math.max(1, Math.round((new Date(claimed.window_end).getTime() - new Date(claimed.window_start).getTime()) / 3_600_000));
  const messages = buildReminderFallbackMessages({
    reminderKey: claimed.reminder_key,
    scheduledFor: claimed.scheduled_for,
    content: claimed.message_text,
    groupName: claimed.group_display_name,
    waitingHours,
  });
  try {
    const result = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lineToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": claimed.fallback_retry_key,
      },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await result.json().catch(() => ({}));
    const acceptedRequestId = result.headers.get("x-line-accepted-request-id") || "";
    if (!result.ok && !(result.status === 409 && acceptedRequestId)) {
      const errorMessage = String(payload.message || `LINE HTTP ${result.status}`).slice(0, 1000);
      const exhausted = Number(claimed.fallback_attempt_count || 0) >= 3;
      await patchAnnouncement(claimed.id, {
        status: exhausted ? "failed" : "fallback_failed",
        fallback_claimed_at: null,
        failed_at: new Date().toISOString(),
        line_request_id: result.headers.get("x-line-request-id") || null,
        error_code: `HTTP_${result.status}`,
        error_message: errorMessage,
      });
      return exhausted ? "failed" : "retry-later";
    }
    await patchAnnouncement(claimed.id, {
      status: "fallback_notified",
      fallback_claimed_at: null,
      fallback_notified_at: new Date().toISOString(),
      line_request_id: result.headers.get("x-line-request-id") || acceptedRequestId || null,
      failed_at: null,
      error_code: null,
      error_message: null,
    });
    return "fallback-notified";
  } catch (error) {
    const errorMessage = String((error as Error)?.message || error).slice(0, 1000);
    const exhausted = Number(claimed.fallback_attempt_count || 0) >= 3;
    await patchAnnouncement(claimed.id, {
      status: exhausted ? "failed" : "fallback_failed",
      fallback_claimed_at: null,
      failed_at: new Date().toISOString(),
      error_code: "NETWORK",
      error_message: errorMessage,
    });
    return exhausted ? "failed" : "retry-later";
  }
}

async function processFallbacks(now: Date) {
  await recoverInterruptedClaims(now);
  await expireManualTests(now);
  await expireStaleScheduledAnnouncements(now);
  const cutoff = new Date(now.getTime() - FALLBACK_GRACE_MINUTES * 60_000).toISOString();
  const rows = await db(
    `pending_announcements?trigger_source=eq.scheduled&status=in.(pending,fallback_failed)`
      + `&window_end=lt.${encodeURIComponent(now.toISOString())}&window_end=gte.${encodeURIComponent(cutoff)}`
      + `&fallback_attempt_count=lt.3&select=*&order=window_end.asc&limit=10`,
  );
  const outcomes = [];
  for (const row of rows || []) {
    outcomes.push({ announcementId: row.id, reminderKey: row.reminder_key, outcome: await sendFallbackBroadcast(row, now) });
  }
  return outcomes;
}

Deno.serve(async request => {
  if (request.method !== "POST") return response(405, { message: "Method not allowed" });
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return response(401, { message: "Unauthorized" });
  if (!supabaseUrl || !serviceKey) return response(503, { message: "Reminder service configuration incomplete" });
  try {
    const [rules, targets] = await Promise.all([
      db("line_reminder_rules?enabled=eq.true&select=*&order=reminder_key.asc"),
      db("line_group_targets?status=eq.active&purpose=eq.production&route_key=in.(exchange,committee)&select=*&order=route_key.asc"),
    ]);
    const targetByRoute = Object.fromEntries((targets || []).map((target: any) => [target.route_key, target]));
    const now = new Date();
    const outcomes = [];
    for (const rule of rules || []) {
      const routeKey = reminderRouteKey(rule.reminder_key);
      const target = targetByRoute[routeKey];
      const opportunistic = isOpportunisticReminder(rule.reminder_key);
      const due = opportunistic
        ? Boolean(opportunisticDeliveryWindow(rule, now, Number(target?.opportunistic_window_minutes || 720), FALLBACK_GRACE_MINUTES))
        : isRuleDue(rule, now);
      const outcome = !due
        ? "not-due"
        : !target
          ? "missing-target"
          : opportunistic
            ? await queueOpportunisticReminder(rule, target, now)
            : await sendPushReminder(rule, target, now);
      outcomes.push({ reminderKey: rule.reminder_key, routeKey, outcome });
    }
    const fallbacks = await processFallbacks(now);
    const activeOutcomes = outcomes.filter(item => item.outcome !== "not-due");
    return response(200, {
      checked: rules?.length || 0,
      due: activeOutcomes.length,
      sent: outcomes.filter(item => item.outcome === "sent").length,
      queued: outcomes.filter(item => item.outcome === "queued" || item.outcome === "queued-expired").length,
      fallbackNotified: fallbacks.filter(item => item.outcome === "fallback-notified").length,
      outcomes,
      fallbacks,
    });
  } catch (error) {
    console.error("line-reminder-cron", error);
    return response(500, { message: String((error as Error)?.message || error).slice(0, 300) });
  }
});
