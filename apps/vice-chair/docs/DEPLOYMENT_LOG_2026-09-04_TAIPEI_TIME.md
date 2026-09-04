# 全系統台北時間統一部署紀錄

日期：2026-09-04

Supabase 專案：`fahrblkukuhgveiptufn`

版本：`v1.0.24`

程式提交：`28d4ec3`（全系統台北時間統一）

## 上線內容

- 任期、權限、換屆、截止日、排程與每月切換統一採用 `Asia/Taipei` 業務日期。
- 表單預設時間、倒數、投票截止、歷程顯示與下載檔名日期統一由共用台北時間工具產生。
- BNI 分析與本機預覽的預設分析日改為台北日期；日期區間計算不再受執行主機時區影響。
- 精確時間仍以 UTC 時間戳保存，只在業務日期判斷與畫面呈現時轉為台北時間。

## 正式部署

- GitHub Pages workflow `33882753384` 成功，正式頁面已載入 `calendar-domain.js?v=4` 與 `v1.0.24` 更新說明。
- Migration `20260904170000_standardize_taipei_business_date.sql` 已正式套用，local／remote migration 版本一致。
- `app-api` 已部署為 version 75、狀態 `ACTIVE`，並維持 `verify_jwt = true`。
- 正式資料庫 `error` 級別 lint：0 項錯誤。
- 未登入呼叫正式 `app-api` 回傳預期的 HTTP 401，確認 JWT 閘道仍正常拒絕未授權存取。

## 資料安全邊界

- 本次 migration 只建立台北業務日期 helper，並以 `create or replace function` 更新三支任期／指派權限函式；沒有 `insert`、`update`、`delete` 或既有資料重寫。
- 沒有建立、執行或修改任何年度換屆排程，也沒有變更委員名單、案件、任務、附件或歷史指派紀錄。
- 原有案件的承辦、結案人與時間戳完整保留，未來仍可回追當時負責人。
- 部署前發現新 migration 與當日既有 migration 同為 `16:00` 版本，已在正式套用前改為唯一的 `17:00` 版本；dry-run 只列出本次一支檔案。

## 驗證

- Node 全套測試：181 項通過、0 失敗。
- 專案與跨模組健檢：0 錯誤；20 項為既有單行 CSS 格式提醒。
- BNI 分析回歸：46／46 逐人逐項完全一致。
- GitHub Pages 正式內容與更新說明已線上讀取確認。
