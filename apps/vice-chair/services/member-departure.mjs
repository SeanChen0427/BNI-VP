// 離會登記（decision-log 2026-07-19）：副主席限定＋防呆。
// 一次同步三份名單：
//   1. bni-analysis/data/departed-members.md（分析引擎排除名單的唯一來源）
//   2. bni-analysis/data/reference/current-members.json（會員主檔；橋接對帳依據）
//   3. vice-chair/assets/js/member-directory.js（前端選單，由主檔自動生成，勿手動編輯名單）
// 防呆：僅 vp/admin、必須重打姓名確認、日期不可未來、重複登記阻擋、可撤銷（journal 保留專業別）。
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function defaultPaths() {
  const analysisRoot = path.resolve(ROOT, "..", "bni-analysis");
  return {
    departedMd: path.join(analysisRoot, "data", "departed-members.md"),
    currentMembers: path.join(analysisRoot, "data", "reference", "current-members.json"),
    memberDirectory: path.join(ROOT, "assets", "js", "member-directory.js"),
    journal: path.join(os.homedir(), "Library", "Application Support", "Fulian VP System", "member-departure-journal.json"),
  };
}

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, "").trim();
}

export function parseDepartedMd(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]*?)\s*\|/);
    if (m && m[1] !== "姓名") rows.push({ name: normalizeName(m[1]), confirmedAt: m[2], note: m[3] === "—" ? "" : m[3] });
  }
  return rows;
}

export function appendDepartedRow(text, { name, confirmedAt, note }) {
  const lines = text.split("\n");
  let lastRowIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\|\s*[^|]+\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(lines[i])) lastRowIndex = i;
  }
  if (lastRowIndex < 0) throw new Error("departed-members.md 找不到離會表格");
  lines.splice(lastRowIndex + 1, 0, `| ${name} | ${confirmedAt} | ${note || "—"} |`);
  return lines.join("\n");
}

export function removeDepartedRow(text, name) {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|/);
    return m && normalizeName(m[1]) === name;
  });
  if (index < 0) throw new Error(`departed-members.md 中找不到 ${name}`);
  lines.splice(index, 1);
  return lines.join("\n");
}

export function renderMemberDirectory(names) {
  const rows = [];
  for (let i = 0; i < names.length; i += 11) {
    rows.push(`    ${names.slice(i, i + 11).map((n) => JSON.stringify(n)).join(",")}`);
  }
  return [
    "(function(){",
    "  // 此檔由離會登記自動同步（來源：bni-analysis/data/reference/current-members.json），勿手動編輯名單。",
    "  const members=[",
    rows.join(",\n"),
    "  ];",
    '  window.FulianMemberDirectory={members:[...members],has:name=>members.includes(String(name||"").trim())};',
    "})();",
    "",
  ].join("\n");
}

async function readJournal(paths) {
  try { return JSON.parse(await readFile(paths.journal, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, entries: [] }; throw error; }
}

async function writeJournal(paths, journal) {
  await mkdir(path.dirname(paths.journal), { recursive: true, mode: 0o700 });
  await writeFile(paths.journal, JSON.stringify(journal, null, 2), { mode: 0o600 });
  await chmod(paths.journal, 0o600).catch(() => {});
}

export async function listState(paths = defaultPaths()) {
  const [departedText, masterText] = await Promise.all([
    readFile(paths.departedMd, "utf8"),
    readFile(paths.currentMembers, "utf8"),
  ]);
  const master = JSON.parse(masterText);
  return {
    currentMembers: master.members.map((m) => ({ name: m.name, profession: m.profession || "" })),
    departed: parseDepartedMd(departedText),
  };
}

// 保持主檔原本「每位會員一行」的緊湊格式
export function renderCurrentMembers(master) {
  const head = Object.entries(master)
    .filter(([key]) => key !== "members")
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");
  const rows = master.members.map((m) => `    ${JSON.stringify(m)}`).join(",\n");
  return `{\n${head}\n  "members": [\n${rows}\n  ]\n}\n`;
}

async function syncFiles(paths, { departedText, master }) {
  master.asOf = new Date().toISOString().slice(0, 10);
  await writeFile(paths.departedMd, departedText);
  await writeFile(paths.currentMembers, renderCurrentMembers(master));
  await writeFile(paths.memberDirectory, renderMemberDirectory(master.members.map((m) => m.name)));
}

export async function registerDeparture({ name, confirmName, confirmedAt, note, by }, paths = defaultPaths()) {
  const target = normalizeName(name);
  if (!target) throw new Error("缺少離會會員姓名");
  if (normalizeName(confirmName) !== target) throw new Error("確認姓名不一致：請重新輸入該會員完整姓名以確認登記");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(confirmedAt || ""))) throw new Error("離會確認日格式必須為 YYYY-MM-DD");
  if (confirmedAt > new Date().toISOString().slice(0, 10)) throw new Error("離會確認日不可為未來日期");

  const [departedText, masterText] = await Promise.all([
    readFile(paths.departedMd, "utf8"),
    readFile(paths.currentMembers, "utf8"),
  ]);
  if (parseDepartedMd(departedText).some((d) => d.name === target)) throw new Error(`${target} 已在離會名單中，不可重複登記`);
  const master = JSON.parse(masterText);
  const index = master.members.findIndex((m) => normalizeName(m.name) === target);
  if (index < 0) throw new Error(`${target} 不在現任會員主檔中（只能登記現任會員）`);

  const removed = master.members.splice(index, 1)[0];
  const cleanNote = String(note || "").trim().slice(0, 120);
  await syncFiles(paths, { departedText: appendDepartedRow(departedText, { name: target, confirmedAt, note: cleanNote }), master });

  const journal = await readJournal(paths);
  journal.entries.push({ name: target, profession: removed.profession || "", confirmedAt, note: cleanNote, at: new Date().toISOString(), by, undone: false });
  await writeJournal(paths, journal);
  return { name: target, confirmedAt, remainingMembers: master.members.length };
}

export async function undoDeparture({ name, confirmName, by }, paths = defaultPaths()) {
  const target = normalizeName(name);
  if (!target) throw new Error("缺少要撤銷的會員姓名");
  if (normalizeName(confirmName) !== target) throw new Error("確認姓名不一致：請重新輸入該會員完整姓名以確認撤銷");

  const [departedText, masterText] = await Promise.all([
    readFile(paths.departedMd, "utf8"),
    readFile(paths.currentMembers, "utf8"),
  ]);
  const master = JSON.parse(masterText);
  if (master.members.some((m) => normalizeName(m.name) === target)) throw new Error(`${target} 已在現任會員主檔中`);

  const journal = await readJournal(paths);
  const entry = [...journal.entries].reverse().find((e) => e.name === target && !e.undone);
  master.members.push({ name: target, profession: entry?.profession || "" });
  await syncFiles(paths, { departedText: removeDepartedRow(departedText, target), master });
  if (entry) { entry.undone = true; entry.undoneAt = new Date().toISOString(); entry.undoneBy = by; }
  else journal.entries.push({ name: target, profession: "", at: new Date().toISOString(), by, undone: true, note: "撤銷時 journal 無原始紀錄，專業別需人工補填" });
  await writeJournal(paths, journal);
  return { name: target, professionRestored: Boolean(entry?.profession), totalMembers: master.members.length };
}

// API 處理器。deps：{ json, requestBody, validIdentity, identityRole }
export async function memberDepartureApi(req, url, res, deps) {
  const { json, requestBody, validIdentity, identityRole } = deps;
  try {
    if (req.method === "GET") {
      const identity = url.searchParams.get("identity") || "";
      if (!validIdentity(identity)) return json(res, 400, { message: "登入身份格式不正確" });
      if (!["admin", "vp"].includes(identityRole(identity))) return json(res, 403, { message: "離會登記僅副主席可使用" });
      return json(res, 200, await listState());
    }
    if (req.method !== "POST") return json(res, 405, { message: "不支援的操作" });
    const body = await requestBody(req);
    const identity = body.identity;
    if (!validIdentity(identity)) return json(res, 400, { message: "登入身份格式不正確" });
    if (!["admin", "vp"].includes(identityRole(identity))) return json(res, 403, { message: "離會登記僅副主席可使用" });
    if (body.action === "register") {
      const result = await registerDeparture({ name: body.name, confirmName: body.confirmName, confirmedAt: body.confirmedAt, note: body.note, by: identity });
      return json(res, 200, { message: `${result.name} 已登記離會（${result.confirmedAt}），三份名單已同步；下次產出分析自動排除`, result, state: await listState() });
    }
    if (body.action === "undo") {
      const result = await undoDeparture({ name: body.name, confirmName: body.confirmName, by: identity });
      return json(res, 200, { message: `${result.name} 的離會登記已撤銷${result.professionRestored ? "，專業別已還原" : "；專業別需至主檔人工補填"}`, result, state: await listState() });
    }
    return json(res, 400, { message: "不支援的動作" });
  } catch (error) {
    return json(res, 400, { message: String(error?.message || error).slice(0, 220) });
  }
}
