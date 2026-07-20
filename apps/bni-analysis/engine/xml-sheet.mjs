// BNI Connect 匯出檔（副檔名 .xls，實為 XML Spreadsheet）解析器。
// 規格：apps/bni-analysis/AGENTS.md「輸入資料格式」。禁止以 BIFF/xlrd 方式解析。
// Cell 的 ss:Index 為 1-based 實際欄位位置，缺格需補空值。

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

// 回傳二維陣列 rows[rowIdx][colIdx]，值為字串（已解實體）；空格為 ""。
export function parseXmlSpreadsheet(xmlText) {
  const rows = [];
  const rowRe = /<Row\b[^>]*>([\s\S]*?)<\/Row>/g;
  const cellRe = /<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g;
  const dataRe = /<Data\b[^>]*>([\s\S]*?)<\/Data>/;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xmlText)) !== null) {
    const cells = [];
    let cursor = 0; // 下一個未指定 ss:Index 的 cell 落點（0-based）
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const attrs = cellMatch[1] || "";
      const inner = cellMatch[2] || "";
      const idxAttr = attrs.match(/ss:Index="(\d+)"/);
      if (idxAttr) cursor = Number(idxAttr[1]) - 1;
      const dataMatch = inner.match(dataRe);
      const value = dataMatch ? decodeEntities(dataMatch[1]).trim() : "";
      while (cells.length < cursor) cells.push("");
      cells[cursor] = value;
      cursor += 1;
    }
    rows.push(cells);
  }
  return rows;
}

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// 從表頭前的參數列擷取報表期間：「從:」「至:」標籤列內的 ISO 日期。
// 不可掃全部日期——標題區另有匯出時間戳（營運在），會誤抓。
export function extractPeriod(rows, headerRowIndex) {
  let start = null;
  let end = null;
  for (let i = 0; i < headerRowIndex; i += 1) {
    const row = rows[i] || [];
    const label = String(row[0] || "").trim();
    if (label !== "從:" && label !== "至:") continue;
    for (const cell of row) {
      const m = String(cell).match(/^(\d{4}-\d{2}-\d{2})T/);
      if (m) {
        if (label === "從:") start = m[1];
        else end = m[1];
        break;
      }
    }
  }
  return { start, end };
}
