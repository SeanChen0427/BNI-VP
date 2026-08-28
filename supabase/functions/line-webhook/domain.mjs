const encoder = new TextEncoder();

export function validLineGroupId(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 100;
}

export function collectGroupEvents(payload) {
  const groups = new Map();
  for (const event of Array.isArray(payload?.events) ? payload.events : []) {
    const groupId = event?.source?.type === "group" ? event.source.groupId : "";
    if (!validLineGroupId(groupId)) continue;
    groups.set(groupId, {
      groupId,
      kind: event.type === "leave" ? "leave" : "present",
      occurredAt: Number.isFinite(Number(event.timestamp))
        ? new Date(Number(event.timestamp)).toISOString()
        : new Date().toISOString(),
    });
  }
  return [...groups.values()];
}

export function collectVoteCallEvents(payload) {
  const events = [];
  for (const event of Array.isArray(payload?.events) ? payload.events : []) {
    const groupId = event?.source?.type === "group" ? event.source.groupId : "";
    const text = event?.type === "message" && event?.message?.type === "text"
      ? String(event.message.text || "")
      : "";
    const replyToken = String(event?.replyToken || "");
    if (!validLineGroupId(groupId) || !text || text.length > 10000 || !replyToken) continue;
    events.push({
      groupId,
      text,
      replyToken,
      webhookEventId: String(event?.webhookEventId || "").slice(0, 200),
      lineMessageId: String(event?.message?.id || "").slice(0, 200),
      occurredAt: Number.isFinite(Number(event.timestamp))
        ? new Date(Number(event.timestamp)).toISOString()
        : new Date().toISOString(),
    });
  }
  return events;
}

function base64(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!rawBody || !signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return constantTimeEqual(base64(new Uint8Array(digest)), signature);
}

export async function resolveLineWebhookChannel(rawBody, signature, channelSecrets) {
  for (const candidate of Array.isArray(channelSecrets) ? channelSecrets : []) {
    const channel = String(candidate?.channel || "").trim();
    const secret = String(candidate?.secret || "");
    if (channel && secret && await verifyLineSignature(rawBody, signature, secret)) return channel;
  }
  return null;
}
