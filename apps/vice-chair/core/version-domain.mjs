const VERSION_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const PRODUCT_VERSION_POLICY = Object.freeze({
  schema: "fulian.product-version-policy.v1",
  legacyThrough: "1.0.25",
  changeTypes: Object.freeze({
    none: Object.freeze({ bump: "none", priority: 0 }),
    fix: Object.freeze({ bump: "patch", priority: 1 }),
    feature: Object.freeze({ bump: "minor", priority: 2 }),
    breaking: Object.freeze({ bump: "major", priority: 3 })
  })
});

function normalizeChangeType(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function increment(component, label) {
  if (!Number.isSafeInteger(component) || component >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} 版本號已超過可安全遞增範圍`);
  }
  return component + 1;
}

export function parseProductVersion(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(VERSION_PATTERN);
  if (!match) return null;

  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;

  return Object.freeze({
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`
  });
}

export function compareProductVersions(left, right) {
  const a = parseProductVersion(left);
  const b = parseProductVersion(right);
  if (!a || !b) {
    throw new TypeError("產品版本必須是 major.minor.patch 格式，例如 1.1.0");
  }

  for (const key of ["major", "minor", "patch"]) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }
  return 0;
}

export function selectHighestChangeType(changeTypes) {
  const values = Array.isArray(changeTypes) ? changeTypes : [changeTypes];
  if (values.length === 0) return "none";

  return values.reduce((selected, value) => {
    const type = normalizeChangeType(value);
    const rule = PRODUCT_VERSION_POLICY.changeTypes[type];
    if (!rule) {
      throw new TypeError(`未知的版本變更類型：${String(value)}`);
    }
    return rule.priority > PRODUCT_VERSION_POLICY.changeTypes[selected].priority
      ? type
      : selected;
  }, "none");
}

export function nextProductVersion(currentVersion, changeTypes) {
  const current = parseProductVersion(currentVersion);
  if (!current) {
    throw new TypeError("目前產品版本必須是 major.minor.patch 格式，例如 1.0.25");
  }

  const type = selectHighestChangeType(changeTypes);
  if (type === "none") return current.version;
  if (type === "fix") {
    return `${current.major}.${current.minor}.${increment(current.patch, "patch")}`;
  }
  if (type === "feature") {
    return `${current.major}.${increment(current.minor, "minor")}.0`;
  }
  return `${increment(current.major, "major")}.0.0`;
}

export function validateReleaseTransition({
  previousVersion,
  currentVersion,
  changeType,
  legacyThrough = PRODUCT_VERSION_POLICY.legacyThrough
} = {}) {
  const type = normalizeChangeType(changeType);
  const current = parseProductVersion(currentVersion);

  if (type === "legacy") {
    const legacy = parseProductVersion(legacyThrough);
    const valid = Boolean(current && legacy && !previousVersion && current.version === legacy.version);
    return Object.freeze({
      valid,
      expectedVersion: legacy?.version || "",
      reason: valid ? "歷史基準版本保留原編碼" : "歷史基準必須等於 legacyThrough，且不得指定前一版本"
    });
  }

  const previous = parseProductVersion(previousVersion);
  if (!previous || !current || !PRODUCT_VERSION_POLICY.changeTypes[type]) {
    return Object.freeze({
      valid: false,
      expectedVersion: "",
      reason: "版本轉換需要有效的前一版本、目前版本與變更類型"
    });
  }

  const expectedVersion = nextProductVersion(previous.version, type);
  const valid = current.version === expectedVersion;
  return Object.freeze({
    valid,
    expectedVersion,
    reason: valid ? "版本轉換符合產品版本規則" : `此變更類型應使用 ${expectedVersion}`
  });
}
