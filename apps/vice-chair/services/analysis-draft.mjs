// 月度分析草稿工作流（decision-log 2026-07-19）：
// 產出（引擎對帳未過即停）→ 草稿（僅副主席可見）→ AI 審視（副主席個人 Key、完整脈絡）
// → 確認發佈（版本化、不可改寫）或退回重做（附原因、AI 帶回饋重跑）。
// 快照含真實會員資料，存於專案外的使用者應用資料目錄，不進 GitHub。
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ANALYSIS_ROOT = path.resolve(ROOT, "..", "bni-analysis");
const STORE_DIR = path.join(os.homedir(), "Library", "Application Support", "Fulian VP System");
const DRAFT_FILE = path.join(STORE_DIR, "analysis-draft.json");
const PUBLISHED_FILE = path.join(STORE_DIR, "analysis-published.json");

const REVIEW_MODELS = { openai: "gpt-5.6-luna", gemini: "gemini-3.6-flash", anthropic: "claude-sonnet-5" };
const GEMINI_REVIEW_MODELS = new Set(["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro"]);
const REVIEW_MAX_TOKENS = 6000;
const taipeiDay = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

async function ensureStoreDir() {
  await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  await chmod(STORE_DIR, 0o700).catch(() => {});
}

async function readJsonFile(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonFile(filePath, data) {
  await ensureStoreDir();
  await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => {});
}

export async function readDraft() { return readJsonFile(DRAFT_FILE, null); }
export async function readPublished() { return readJsonFile(PUBLISHED_FILE, { version: 1, snapshots: [] }); }

async function runEngine() {
  const { buildAnalysis } = await import(path.join(ANALYSIS_ROOT, "engine", "analyze.mjs"));
  return buildAnalysis({ asOf: taipeiDay() });
}

// 發佈時以快照重產會員關懷儀表板（index.html）；舊版依計分期間歸檔至 data/archive/，不覆蓋既有歸檔。
async function publishDashboard(snapshot) {
  const { renderDashboard } = await import(path.join(ANALYSIS_ROOT, "engine", "render-dashboard.mjs"));
  const indexPath = path.join(ANALYSIS_ROOT, "index.html");
  const archiveDir = path.join(ANALYSIS_ROOT, "data", "archive");
  try {
    const previous = await readFile(indexPath, "utf8");
    const m = previous.match(/計分期間 (\d{4})-(\d{2})-\d{2} [–-] (\d{4})-(\d{2})-\d{2}/);
    let archiveName = m ? `report_${m[1]}-${m[2]}_${m[3]}-${m[4]}.html` : `report_replaced_${Date.now()}.html`;
    let archivePath = path.join(archiveDir, archiveName);
    if (existsSync(archivePath)) archivePath = path.join(archiveDir, archiveName.replace(/\.html$/, `_${Date.now()}.html`));
    await mkdir(archiveDir, { recursive: true });
    await writeFile(archivePath, previous);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(indexPath, renderDashboard(snapshot));
}

// AI 審視完整脈絡（品質優先，不省 token；decision-log 2026-07-19）：
// SKILL.md＋AGENTS.md 全文＋reference 驗證檔＋離會名單＋引擎本月結構化結果＋上月已發佈審視＋退回回饋。
function readAnalysisDoc(relative) {
  const filePath = path.join(ANALYSIS_ROOT, relative);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function latestReferenceDocs() {
  const dir = path.join(ANALYSIS_ROOT, "data", "reference");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: `data/reference/${f}`, content: readFileSync(path.join(dir, f), "utf8") }));
}

export const REVIEW_SYSTEM_PROMPT = [
  "你是 BNI 富聯分會會員委員會的月度分析審視員，任務是把分析引擎算好的結構化結果，審視並撰寫成正式的月度關懷報告。",
  "你必須完整遵守使用者訊息中附上的專案規格書（AGENTS.md）與執行指令（SKILL.md），包括六條核心紀律、負面清單、輸出格式與語氣要求。",
  "引擎數據是唯一數據來源：不得重算任何分數、不得修改燈號、不得發明數據。你的價值在判讀：對帳異常的可能原因、個案的綜合模式（例如高出席但連結深度下滑）、審計訊號的無辜解釋與關懷切入方向。",
  "審計觀察必須用關懷語言，不得指控；已有無辜解釋的觀察（見 reference 檔）要標明已解釋與驗證條件。",
  "估算值一律標明「估算」。每個判斷附數據算式。不輸出全員燈號排名表。",
  "你不得作成任何資格處置、續約核准或投票建議；報告結尾標注「本報告為草稿，需副主席確認後才正式發佈」。",
  "若收到副主席的退回回饋，必須逐點回應並在新版報告中修正。",
  "輸出格式：依 SKILL.md 六區關懷報告結構，繁體中文 Markdown。除制度性燈號標記與警示符號外禁止 Emoji。",
].join("\n");

export function buildReviewPrompt(draft, previousReport) {
  const sections = [];
  sections.push(`# 專案規格書（AGENTS.md）\n\n${readAnalysisDoc("AGENTS.md")}`);
  sections.push(`# 執行指令（SKILL.md）\n\n${readAnalysisDoc("skill/SKILL.md")}`);
  sections.push(`# 離會名單\n\n${readAnalysisDoc("data/departed-members.md")}`);
  for (const doc of latestReferenceDocs()) sections.push(`# 驗證與觀察檔：${doc.name}\n\n${doc.content}`);
  if (previousReport) sections.push(`# 上月已發佈的審視報告（連續性脈絡）\n\n${previousReport}`);
  if (draft.feedback?.length) {
    sections.push(`# 副主席退回回饋（必須逐點回應並修正）\n\n${draft.feedback.map((f, i) => `${i + 1}. （${f.at}）${f.reason}`).join("\n")}`);
  }
  sections.push(`# 引擎本月結構化結果（唯一數據來源）\n\n\`\`\`json\n${JSON.stringify(draft.engine, null, 1)}\n\`\`\``);
  sections.push("請依上述規格產出本月六區關懷報告草稿。");
  return sections.join("\n\n---\n\n");
}

function selectedReviewModel(provider, requested) {
  if (provider !== "gemini") return REVIEW_MODELS[provider];
  const model = String(requested || REVIEW_MODELS.gemini);
  if (!GEMINI_REVIEW_MODELS.has(model)) throw new Error("不支援的 Gemini 模型，請重新選擇");
  return model;
}

async function callReviewProvider(provider, apiKey, prompt, requestedModel) {
  let response;
  let data;
  const model = selectedReviewModel(provider, requestedModel);
  if (provider === "anthropic") {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: REVIEW_MAX_TOKENS, system: REVIEW_SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] }),
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) return { text: (data?.content || []).filter((i) => i?.type === "text").map((i) => i.text).join("\n").trim(), model };
  } else if (provider === "openai") {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions: REVIEW_SYSTEM_PROMPT, input: prompt, max_output_tokens: REVIEW_MAX_TOKENS }),
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = typeof data?.output_text === "string" ? data.output_text.trim() : (data?.output || []).flatMap((i) => i?.content || []).filter((i) => i?.type === "output_text").map((i) => i.text).join("\n").trim();
      return { text, model };
    }
  } else if (provider === "gemini") {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: REVIEW_SYSTEM_PROMPT }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: REVIEW_MAX_TOKENS } }),
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) return { text: (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || "").join("\n").trim(), model };
  } else {
    throw new Error("不支援的 AI 平台");
  }
  const message = data?.error?.message || data?.error?.status || `HTTP ${response?.status || 500}`;
  throw new Error(`AI 平台回應失敗：${String(message).slice(0, 180)}`);
}

// 主要 API 處理器。deps：{ json, requestBody, validIdentity, identityRole, readAiStore }
export async function analysisDraftApi(req, url, res, deps) {
  const { json, requestBody, validIdentity, identityRole, readAiStore } = deps;
  try {
    if (req.method === "GET") {
      const identity = url.searchParams.get("identity") || "";
      if (!validIdentity(identity)) return json(res, 400, { message: "登入身份格式不正確" });
      if (!["admin", "vp"].includes(identityRole(identity))) return json(res, 403, { message: "分析草稿僅副主席可見" });
      const draft = await readDraft();
      return json(res, 200, { draft });
    }
    if (req.method !== "POST") return json(res, 405, { message: "不支援的操作" });
    const body = await requestBody(req);
    const identity = body.identity;
    if (!validIdentity(identity)) return json(res, 400, { message: "登入身份格式不正確" });
    if (!["admin", "vp"].includes(identityRole(identity))) return json(res, 403, { message: "分析草稿僅副主席可操作" });

    if (body.action === "generate") {
      const engine = await runEngine();
      if (engine.aborted) {
        return json(res, 409, { message: "對帳未通過，未產生草稿（先對帳，後分析）", issues: engine.reconciliation.issues });
      }
      const existing = await readDraft();
      const draft = {
        id: `draft-${Date.now()}`,
        status: "draft",
        engine,
        aiReview: null,
        feedback: existing?.feedback && existing.engine?.meta?.period?.end === engine.meta.period.end ? existing.feedback : [],
        createdAt: new Date().toISOString(),
        createdBy: identity,
      };
      await writeJsonFile(DRAFT_FILE, draft);
      return json(res, 200, { draft });
    }

    const draft = await readDraft();
    if (!draft && body.action !== "generate") return json(res, 400, { message: "目前沒有分析草稿，請先產出分析" });

    if (body.action === "ai-review") {
      const provider = body.provider;
      const store = await readAiStore();
      const apiKey = store.profiles?.[identity]?.keys?.[provider]?.value;
      if (!apiKey) return json(res, 400, { message: "此身分尚未綁定所選平台的 API Key，請先到設定完成綁定" });
      const published = await readPublished();
      const previous = published.snapshots.at(-1)?.aiReview?.text || null;
      const prompt = buildReviewPrompt(draft, previous);
      const result = await callReviewProvider(provider, apiKey, prompt, body.model);
      if (!result.text) throw new Error("AI 平台未回傳可顯示的文字");
      draft.aiReview = { provider, model: result.model, text: result.text, generatedAt: new Date().toISOString(), promptChars: prompt.length, feedbackCount: draft.feedback.length };
      await writeJsonFile(DRAFT_FILE, draft);
      return json(res, 200, { draft });
    }

    if (body.action === "reject") {
      const reason = String(body.reason || "").trim().slice(0, 2000);
      if (!reason) return json(res, 400, { message: "退回重做必須附上原因" });
      draft.feedback.push({ reason, at: new Date().toISOString(), by: identity });
      await writeJsonFile(DRAFT_FILE, draft);
      return json(res, 200, { draft, message: "已記錄退回原因；請重新執行 AI 審視，回饋會一併帶入" });
    }

    if (body.action === "publish") {
      if (!draft.aiReview) return json(res, 400, { message: "尚未執行 AI 審視，請先完成審視再發佈" });
      const published = await readPublished();
      const version = published.snapshots.length + 1;
      // 已發佈快照不可改寫：只新增版本，不修改既有版本
      const snapshot = {
        version,
        id: `analysis-v${version}`,
        publishedAt: new Date().toISOString(),
        publishedBy: identity,
        period: draft.engine.meta.period,
        engine: draft.engine,
        aiReview: draft.aiReview,
        feedbackHistory: draft.feedback,
      };
      published.snapshots.push(snapshot);
      await writeJsonFile(PUBLISHED_FILE, published);
      await writeJsonFile(DRAFT_FILE, null);
      await publishDashboard(snapshot);
      return json(res, 200, { message: `已發佈第 ${version} 版分析快照，會員關懷儀表板已更新（舊版已歸檔）`, version });
    }

    return json(res, 400, { message: "不支援的動作" });
  } catch (error) {
    return json(res, 500, { message: `分析草稿無法處理：${String(error?.message || error).slice(0, 220)}` });
  }
}

// 已發佈快照查詢：全體登入者可讀（committee 只能看到已發佈內容，本 API 僅提供已發佈內容）。
export async function analysisSnapshotsApi(req, url, res, deps) {
  const { json, validIdentity } = deps;
  try {
    if (req.method !== "GET") return json(res, 405, { message: "不支援的操作" });
    const identity = url.searchParams.get("identity") || "";
    if (!validIdentity(identity)) return json(res, 400, { message: "登入身份格式不正確" });
    const published = await readPublished();
    const versionParam = url.searchParams.get("version");
    if (versionParam) {
      const snapshot = published.snapshots.find((s) => String(s.version) === versionParam);
      if (!snapshot) return json(res, 404, { message: "找不到指定版本的分析快照" });
      return json(res, 200, { snapshot });
    }
    return json(res, 200, {
      snapshots: published.snapshots.map((s) => ({ version: s.version, id: s.id, publishedAt: s.publishedAt, publishedBy: s.publishedBy, period: s.period })),
      latest: published.snapshots.at(-1) || null,
    });
  } catch (error) {
    return json(res, 500, { message: `分析快照無法讀取：${String(error?.message || error).slice(0, 220)}` });
  }
}
