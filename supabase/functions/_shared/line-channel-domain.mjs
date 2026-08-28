export const LINE_OA_CHANNELS = Object.freeze({
  VICE_CHAIR: "vice_chair",
  COMMITTEE: "committee",
});

export const LINE_OA_LABELS = Object.freeze({
  [LINE_OA_CHANNELS.VICE_CHAIR]: "副主席秘書Bot",
  [LINE_OA_CHANNELS.COMMITTEE]: "會員委員秘書Bot",
});

const ROUTE_CHANNELS = Object.freeze({
  attendance: LINE_OA_CHANNELS.VICE_CHAIR,
  leadership: LINE_OA_CHANNELS.VICE_CHAIR,
  exchange: LINE_OA_CHANNELS.VICE_CHAIR,
  committee: LINE_OA_CHANNELS.COMMITTEE,
});

export function normalizeLineChannel(value) {
  const channel = String(value || "").trim();
  return Object.values(LINE_OA_CHANNELS).includes(channel) ? channel : null;
}

export function lineChannelForRoute(routeKey) {
  return ROUTE_CHANNELS[String(routeKey || "").trim()] || null;
}

export function lineChannelLabel(value) {
  return LINE_OA_LABELS[normalizeLineChannel(value)] || "未知 LINE 助理";
}

export function lineChannelMatchesRoute(channel, routeKey) {
  const required = lineChannelForRoute(routeKey);
  return Boolean(required && required === normalizeLineChannel(channel));
}
