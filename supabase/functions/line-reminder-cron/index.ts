import { buildLineMentionAllMessage } from "../app-api/line-message.mjs";
import { isRuleDue, ruleDueDate } from "../_shared/line-reminder-domain.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const cronSecret = Deno.env.get("LINE_REMINDER_CRON_SECRET") || "";

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

async function sendReminder(rule: any, target: any, now: Date) {
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

Deno.serve(async request => {
  if (request.method !== "POST") return response(405, { message: "Method not allowed" });
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return response(401, { message: "Unauthorized" });
  if (!supabaseUrl || !serviceKey || !lineToken) return response(503, { message: "Reminder service configuration incomplete" });
  try {
    const [rules, targets] = await Promise.all([
      db("line_reminder_rules?enabled=eq.true&select=*&order=reminder_key.asc"),
      db("line_group_targets?status=eq.active&route_key=eq.exchange&select=*&limit=1"),
    ]);
    const target = targets?.[0];
    if (!target) return response(200, { checked: rules?.length || 0, sent: 0, message: "No active exchange group" });
    const now = new Date();
    const dueRules = (rules || []).filter((rule: any) => isRuleDue(rule, now));
    const outcomes = [];
    for (const rule of dueRules) outcomes.push({ reminderKey: rule.reminder_key, outcome: await sendReminder(rule, target, now) });
    return response(200, { checked: rules?.length || 0, due: dueRules.length, sent: outcomes.filter(item => item.outcome === "sent").length, outcomes });
  } catch (error) {
    console.error("line-reminder-cron", error);
    return response(500, { message: String((error as Error)?.message || error).slice(0, 300) });
  }
});
