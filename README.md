# 產險續保系統

`main` 為 V2.2 正式版；本分支 `feature/v2.3-calendar-export` 為 **V2.3 RC1 測試版**，尚未正式發布。

Google Calendar 方案 A：使用者授權且網站開啟時同步，建立到期前一個曆月提醒；支援新增、修改、取消、去重及失敗後重新同步。保留 iPhone Safari 和 iCloud Drive JSON 手動備份／還原。

- [開發規格與歷史](docs/V2.3-google-calendar-plan.md)
- [RC1 測試結果、待完成項目及 Google／iPhone 操作步驟](docs/V2.3-RC1-test-guide.md)

執行自動測試：`npm test`（Node >=20，不需安裝套件）。

V2.3 使用獨立本機資料庫；首次使用請先從 V2.2 匯出 JSON，再於測試版還原。請在獨立 HTTPS 測試網址驗收，不要覆蓋 V2.2 正式網站。
