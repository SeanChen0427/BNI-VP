(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FulianAiKnowledgeDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STOP_TERMS = new Set([
    "什麼",
    "怎麼",
    "如何",
    "是否",
    "可以",
    "請問",
    "一下",
    "這個",
    "那個",
    "是什",
    "什麼",
    "麼怎",
    "怎麼",
  ]);

  const INTENT_ALIASES = [
    {
      pattern: /是什麼|意思|定義|用途|代表什麼/u,
      terms: ["定義", "定位", "用途", "代表", "框架"],
    },
    {
      pattern: /怎麼|如何|執行|操作|流程|步驟|作業/u,
      terms: ["執行", "操作", "流程", "步驟", "運作", "階段", "作業"],
    },
    {
      pattern: /誰|角色|負責|權限/u,
      terms: ["角色", "負責", "權限", "人員"],
    },
    {
      pattern: /期限|多久|何時|時間|幾天|幾週|幾個月/u,
      terms: ["期限", "時間", "日期", "週", "月"],
    },
  ];

  function normalizeQuery(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\p{Script=Han}]+/gu, " ")
      .trim();
  }

  function queryTerms(question) {
    const original = String(question || "").toLowerCase();
    const normalized = normalizeQuery(original);
    const terms = [];

    for (const token of normalized.match(/[a-z0-9]+/g) || []) {
      if (token.length >= 2) terms.push(token);
    }

    for (const sequence of normalized.match(/\p{Script=Han}+/gu) || []) {
      if (sequence.length >= 2 && sequence.length <= 8 && !STOP_TERMS.has(sequence)) {
        terms.push(sequence);
      }
      for (let index = 0; index < sequence.length - 1; index += 1) {
        const term = sequence.slice(index, index + 2);
        if (!STOP_TERMS.has(term)) terms.push(term);
      }
    }

    for (const intent of INTENT_ALIASES) {
      if (intent.pattern.test(original)) terms.push(...intent.terms);
    }

    return [...new Set(terms)].slice(0, 40);
  }

  function splitKnowledgeDocument(text, relativePath) {
    const lines = String(text || "").split(/\r?\n/);
    const chunks = [];
    let title = relativePath;
    let buffer = [];
    const headingStack = [];
    const flush = () => {
      const content = buffer.join("\n").trim();
      if (content.length >= 30) chunks.push({ title, path: relativePath, content });
      buffer = [];
    };

    for (const line of lines) {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading && buffer.length) flush();
      if (heading) {
        const level = heading[1].length;
        headingStack[level - 1] = heading[2].trim();
        headingStack.length = level;
        title = headingStack.filter(Boolean).join(" › ");
      }
      buffer.push(line);
      if (buffer.join("\n").length >= 3200) flush();
    }
    flush();
    return chunks;
  }

  function countOccurrences(text, term, limit) {
    if (!term || !text.includes(term)) return 0;
    return Math.min(text.split(term).length - 1, limit);
  }

  function selectKnowledge(question, chunks, limit = 5) {
    const terms = queryTerms(question);
    if (!terms.length) return [];

    return chunks
      .map((chunk, index) => {
        const title = normalizeQuery(chunk.title);
        const path = normalizeQuery(chunk.path);
        const content = normalizeQuery(chunk.content);
        let score = 0;
        let titleHits = 0;
        let contentHits = 0;

        for (const term of terms) {
          if (title.includes(term)) {
            score += 10;
            titleHits += 1;
          }
          if (path.includes(term)) score += 3;
          const hits = countOccurrences(content, term, 8);
          score += hits;
          contentHits += hits;
        }

        return { ...chunk, score, titleHits, contentHits, index };
      })
      .filter(chunk => chunk.score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        right.titleHits - left.titleHits ||
        right.contentHits - left.contentHits ||
        left.index - right.index
      )
      .slice(0, limit)
      .map(({ titleHits, contentHits, index, ...chunk }) => chunk);
  }

  function sanitizeAiAnswer(value) {
    const blocked = [
      /must use this exact phrase/i,
      /drafting final(?: answer| text)?/i,
      /^\s*(?:analysis|reasoning|internal (?:note|reasoning)|system (?:note|instruction)|developer instruction)\s*:/i,
    ];

    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter(line => !blocked.some(pattern => pattern.test(line)))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return {
    normalizeQuery,
    queryTerms,
    splitKnowledgeDocument,
    selectKnowledge,
    sanitizeAiAnswer,
  };
});
