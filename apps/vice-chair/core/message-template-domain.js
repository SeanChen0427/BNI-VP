(function exposeMessageTemplateDomain(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FulianMessageTemplateDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createMessageTemplateDomain() {
  const MAX_CONTENT_LENGTH = 12000;
  const HISTORY_LIMIT = 30;
  const MESSAGE_SEPARATOR = "\n\n[[FULIAN_MESSAGE_BREAK]]\n\n";
  const definitions = Object.freeze([
    Object.freeze({
      id: "new-member-assistance-group-opening",
      category: "新會員入會",
      title: "繳費後協助群開場與訪談邀約",
      target: "新會員協助群組",
      description: "新會員完成申請表與繳費，秘財建立主席、副主席、秘財與新會員的協助群後，依序使用兩段文案。",
      usesVicePresidentProfile: true,
      messages: Object.freeze([
        Object.freeze({
          id: "introduction",
          title: "01・加入群組後：＠ 新會員並自我介紹",
          copyLabel: "複製自我介紹",
          hint: "貼上 LINE 後，請以 ＠ 功能標註新會員本人。",
        }),
        Object.freeze({
          id: "interview-scheduling",
          title: "02・新會員回覆後：邀約入會訪談時間",
          copyLabel: "複製訪談邀約",
          hint: "請等待新會員自我介紹後再傳送。",
        }),
      ]),
      content: `＠【新會員姓名】

歡迎您的加入，我是富聯副主席【副主席行業別】的【副主席姓名】，請多指教。${MESSAGE_SEPARATOR}我們將安排兩位會員委員與您進行入會訪談，預計全程約需 2 小時。為了確保對談品質，請您預留一段能完整專注、不受干擾的時間。本次訪談將採線上方式進行，再請您提供幾個方便的時間段，以便我為您安排，謝謝！！`,
    }),
    Object.freeze({
      id: "group-usage-guide",
      category: "新會員入會",
      title: "富聯分會各群組使用說明",
      target: "新會員協助群組",
      description: "新會員宣示後，貼到新會員協助群組說明各群組用途。",
      content: `【 富聯分會-各群組使用說明 】

為了營造正向積極的商務環境，富聯分會所開立的群組中，請避免討論政治、宗教、負面情緒等文字，若列入續約審核。

▲行政小組群：分會將分為七個行政小組，各組會有一名組長，組長會回報每週組員出席的狀況，並向組員傳遞資訊及交流等。

▲公告群：由核心群發佈公告，會員已讀即可，不需在此群做回應。

▲交流群：稱為-大群/交流/聊天群，可用於哈啦、聊天、交流、打招呼、歡迎新人專用(但嚴禁政治、宗教及非本專業以外之推廣)，可將名片放相簿。

▲來賓接龍群：僅限會員來賓邀請報名接龍用。

▲來賓臨時群：用於當週來賓邀約入群及互動，協助來賓完成簡報資料。

▲培訓接龍群：僅限培訓課程報名接龍用。

▲培訓及工作坊臨時群：參與當期培訓資訊佈達臨時群。

▲引薦及感謝單回報群：每週例會後開相簿，週二到下週一，請將key完引薦單及感謝單之後截圖上傳。

▲一對一回報群：每週二副主席開相簿，週二到下週一，一對一拍照回報於當週相簿中。（拿著一對一表格拍照，線上一對一就開一個人的表格分享拍照上傳至相簿）

▲許願池廣告群：僅限尋找生意引薦需求、人脈資源許願及公司活動廣宣用。

▲軟性活動接龍群：用於軟性活動報名接龍用。（發佈前須經核心團隊認可）

■ 其他：各領導團隊功能群。

---
注意：非官方群組如有任何引薦爭議，會員委員會無權督導及處理，請會員懂得自身權益保障！`,
    }),
    Object.freeze({
      id: "new-member-interview-confirmation",
      category: "新會員入會",
      title: "新會員訪談資料確認",
      target: "新會員本人私訊",
      description: "需要私訊新會員確認訪談資料時使用。",
      content: `你好～
新會員訪談表及申請表內容若沒有問題，再請協助「複製填寫」下面的資料並「貼上回覆」，以示證明上述資料確認正確。

如果訪談內容沒問題請再幫回覆『訪談內容無誤，已確認！』並加上

姓名:
身分證字號:
確認訪談表時間:`,
    }),
    Object.freeze({
      id: "renewal-interview-confirmation",
      category: "續約作業",
      title: "續約訪談資料確認",
      target: "續約會員本人私訊",
      description: "需要私訊續約會員確認期終輔導資料時使用。",
      content: `你好～
會員期終輔導訪談表及申請表內容若沒有問題，再請協助「複製填寫」下面的資料並「貼上回覆」，以示證明上述資料確認正確。

如果訪談內容沒問題請再幫回覆『訪談內容無誤，已確認！』並加上

姓名:
身分證號:
確認訪談表時間:`,
    }),
  ]);
  const byId = new Map(definitions.map(item => [item.id, item]));

  function text(value) {
    return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
  }

  function definitionFor(value) {
    if (typeof value === "string") return byId.get(value) || null;
    return value?.id ? byId.get(value.id) || value : null;
  }

  function contentParts(template, content = template?.content) {
    const definition = definitionFor(template);
    const normalizedContent = text(content);
    const messages = Array.isArray(definition?.messages) ? definition.messages : [];
    if (messages.length < 2) {
      return [{ id: "content", title: "文稿內容", copyLabel: "複製文案", hint: "", content: normalizedContent }];
    }
    const values = normalizedContent.split(MESSAGE_SEPARATOR);
    if (values.length !== messages.length) {
      return [{ id: "content", title: "文稿內容", copyLabel: "複製文案", hint: "", content: normalizedContent }];
    }
    return messages.map((message, index) => ({ ...message, content: values[index] }));
  }

  function joinContent(template, parts) {
    const definition = definitionFor(template);
    const values = Array.isArray(parts) ? parts.map(text) : [];
    const messages = Array.isArray(definition?.messages) ? definition.messages : [];
    return messages.length > 1 && values.length === messages.length
      ? values.join(MESSAGE_SEPARATOR)
      : values[0] || "";
  }

  function personalizeContent(content, { vicePresidentName = "", vicePresidentProfession = "" } = {}) {
    const replacements = {
      "【副主席姓名】": text(vicePresidentName).trim() || "【副主席姓名】",
      "【副主席行業別】": text(vicePresidentProfession).trim() || "【副主席行業別】",
    };
    return Object.entries(replacements).reduce(
      (result, [placeholder, replacement]) => result.split(placeholder).join(replacement),
      text(content),
    );
  }

  function contentIssue(definition, content) {
    const normalizedContent = text(content);
    const messages = Array.isArray(definition?.messages) ? definition.messages : [];
    if (messages.length > 1 && normalizedContent.split(MESSAGE_SEPARATOR).length !== messages.length) {
      return "多段文稿的分段結構不完整";
    }
    if (definition?.usesVicePresidentProfile) {
      const missing = ["【副主席姓名】", "【副主席行業別】"].filter(placeholder => !normalizedContent.includes(placeholder));
      if (missing.length) return `動態公版必須保留 ${missing.join("、")}`;
    }
    return "";
  }

  function defaults() {
    return {
      version: 1,
      contents: Object.fromEntries(definitions.map(item => [item.id, item.content])),
      meta: {},
      history: [],
      updatedAt: "",
      updatedBy: "",
    };
  }

  function normalize(value) {
    const base = defaults();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    for (const definition of definitions) {
      const candidate = text(value.contents?.[definition.id]);
      const accepted = candidate.trim() && candidate.length <= MAX_CONTENT_LENGTH && !contentIssue(definition, candidate);
      if (accepted) {
        base.contents[definition.id] = candidate;
      }
      const meta = value.meta?.[definition.id];
      if (accepted && meta && typeof meta === "object") {
        base.meta[definition.id] = {
          updatedAt: text(meta.updatedAt).slice(0, 40),
          updatedBy: text(meta.updatedBy).slice(0, 120),
        };
      }
    }
    base.history = Array.isArray(value.history)
      ? value.history.filter(item => byId.has(item?.templateId)).slice(0, HISTORY_LIMIT)
      : [];
    base.updatedAt = text(value.updatedAt).slice(0, 40);
    base.updatedBy = text(value.updatedBy).slice(0, 120);
    return base;
  }

  function saveTemplate(value, templateId, content, {updatedAt = "", updatedBy = ""} = {}) {
    const definition = byId.get(templateId);
    if (!definition) throw new Error("找不到指定的文稿範本");
    const nextContent = text(content);
    if (!nextContent.trim()) throw new Error("文稿內容不可空白");
    if (nextContent.length > MAX_CONTENT_LENGTH) throw new Error(`文稿內容不可超過 ${MAX_CONTENT_LENGTH} 字`);
    const issue = contentIssue(definition, nextContent);
    if (issue) throw new Error(issue);
    const current = normalize(value);
    const timestamp = text(updatedAt) || new Date().toISOString();
    const actor = text(updatedBy).slice(0, 120);
    const previousContent = current.contents[templateId];
    current.contents[templateId] = nextContent;
    current.meta[templateId] = { updatedAt: timestamp, updatedBy: actor };
    current.updatedAt = timestamp;
    current.updatedBy = actor;
    if (previousContent !== nextContent) {
      current.history = [{ templateId, previousContent, updatedAt: timestamp, updatedBy: actor }, ...current.history].slice(0, HISTORY_LIMIT);
    }
    return current;
  }

  function response(value) {
    const settings = normalize(value);
    return {
      templates: definitions.map(definition => ({
        ...definition,
        content: settings.contents[definition.id],
        defaultContent: definition.content,
        updatedAt: settings.meta[definition.id]?.updatedAt || "",
        updatedBy: settings.meta[definition.id]?.updatedBy || "",
      })),
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
    };
  }

  return Object.freeze({
    definitions,
    MAX_CONTENT_LENGTH,
    MESSAGE_SEPARATOR,
    defaults,
    normalize,
    saveTemplate,
    response,
    contentParts,
    joinContent,
    personalizeContent,
  });
});
