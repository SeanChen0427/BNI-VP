import { collectGroupEvents, verifyLineSignature } from "./domain.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET") || "";

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
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

async function recordGroupEvent(event: { groupId: string; kind: string; occurredAt: string }) {
  const encoded = encodeURIComponent(event.groupId);
  const existingRows = await db(`line_group_targets?line_group_id=eq.${encoded}&select=id,status&limit=1`);
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
      body: JSON.stringify({ line_group_id: event.groupId, last_event_at: event.occurredAt }),
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

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { message: "Method not allowed" });
  if (!supabaseUrl || !serviceKey || !channelSecret) {
    return json(503, { message: "LINE webhook is not configured" });
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 1024 * 1024) return json(413, { message: "Payload too large" });
  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) return json(413, { message: "Payload too large" });
  const signature = request.headers.get("x-line-signature") || "";
  if (!await verifyLineSignature(rawBody, signature, channelSecret)) {
    return json(401, { message: "Invalid signature" });
  }
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json(400, { message: "Invalid JSON" }); }
  try {
    // Only opaque group IDs and timestamps are retained. User message content is ignored.
    await Promise.all(collectGroupEvents(payload).map(recordGroupEvent));
    return json(200, { ok: true });
  } catch (error) {
    console.error("LINE webhook persistence failed", String((error as Error)?.message || error));
    return json(500, { message: "Webhook persistence failed" });
  }
});
