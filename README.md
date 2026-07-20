# 富聯分會會員委員會整合系統

本專案將「副主席工作台」與「BNI 會員關懷分析工具」放在同一個總專案中管理。兩個原始專案均保留不動；整合版使用複本建立，後續修改以本專案為主。

## 產品分工

- `apps/vice-chair/`：登入、工作總覽、案件、訪談、投票、點名、月會、交接課程與 AI 助手。
- `apps/bni-analysis/`：PALMS、紅綠燈、續約、審計與會員關懷分析的唯一規則及資料來源。
- `apps/vice-chair/bni-bridge.mjs`：只讀取分析結果並轉成工作台使用的版本化資料。

副主席工作台不得自行複製燈號或診斷公式；所有會員數據判斷必須回到 BNI 分析工具。

## 本機啟動

```bash
npm start
```

開啟：

- 工作台：`http://127.0.0.1:4173/`
- 完整 BNI 分析工具：`http://127.0.0.1:4173/analysis/`
- 會員關懷整合頁：`http://127.0.0.1:4173/member-care.html`

## 驗證

```bash
npm run check
```

## 資料安全

目前整合版仍包含由原 BNI 專案複製的本機資料，只適合在 Sean 的電腦上使用。`apps/bni-analysis/data/`、訪談附件、會員個資、投票明細、LINE Token、AI API Key 與正式帳密不得加入 GitHub。

正式上架前必須將私密資料移至 Supabase Private Storage／Database，並把分析程序改為伺服器端工作；GitHub 只保存程式碼、規則骨架與去識別化測試資料。
