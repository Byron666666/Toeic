# FlipWords 多益單字卡

FlipWords 是一個靜態網頁版多益單字卡工具，用來瀏覽、搜尋、複習與管理 TOEIC 單字。

## 功能

- 單字卡正反面複習
- 未學會 / 重點複習 / 已學會牌堆切換
- 每張單字卡可加入重點複習，三種學習狀態互不重複
- 單字發音
- 搜尋英文、中文、音標、詞性、例句與同義詞
- 依分類篩選
- 新增、編輯、刪除單字
- 匯入 / 匯出 JSON 備份
- 使用 localStorage 保留學習狀態

## 開啟方式

這個專案不需要安裝套件，也不需要 build。

直接用瀏覽器開啟：

```text
index.html
```

或在本機伺服器中開啟也可以。

## 主要檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 網頁結構與 script 載入順序 |
| `styles.css` | 畫面樣式 |
| `app.js` | 單字卡互動、搜尋、匯入匯出、localStorage 邏輯 |
| `vocab-data.js` | 目前網站載入的主要單字資料 |
| `pronunciation-data.js` | 額外發音資料 |
| `enrichment-data.js` | 額外同義詞資料 |
| `card-details-data.js` | 額外例句、詞性、音標資料 |
| `duplicate-words-in-json.md` | 最近一次英文單字去重紀錄 |

## 更新單字資料

如果要用新的 JSON 取代網站全部單字：

1. 先確認 JSON 是合法格式。
2. 依英文 `word` 欄位去重，保留第一次出現的資料。
3. 用去重後資料重新產生 `vocab-data.js`。
4. 更新 `app.js` 裡的 `BUILT_IN_LIBRARY_VERSION`。
5. 重新整理網站，瀏覽器會用新版內建資料取代舊 localStorage 資料。

目前版本：

```js
const BUILT_IN_LIBRARY_VERSION = "flipwords-backup-2026-05-30-2-json-5018-deduped-replace";
```

## 注意事項

- 英文單字是否重複以 `word` 欄位判斷，會忽略大小寫與多餘空白。
- `id` 重複目前沒有清理，因為這次需求是只刪英文單字重複。
- 如果只修改 `vocab-data.js` 但沒有更新 `BUILT_IN_LIBRARY_VERSION`，瀏覽器可能會繼續使用舊的 localStorage 資料。
- 匯入備份時，網站會把匯入資料與內建資料合併；若要完全替換網站內建資料，應直接更新 `vocab-data.js`。
