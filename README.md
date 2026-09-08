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
- 獨立的「大考中心 7000 單字」Level 1–6 分級練習區

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
| `7000/` | 7000 單字的獨立頁面、互動程式、樣式與分級資料 |
| `duplicate-words-in-json.md` | 最近一次英文單字去重紀錄 |

## 7000 單字分級區

從首頁的「7000 單字」分頁，或直接開啟 `7000/index.html`。附件中的字彙依 Level 1–6 分開呈現，並使用 `flipwords:gsat-7000:*` 的 localStorage key；單字內容與學習進度都不會併入原本的 TOEIC 字庫。

原始附件為 `7000單(1).pdf`（75 頁），依原稿的合併詞條與分義整理為 6,427 張卡片，並非 7,000 張獨立卡片。六級張數依序為 1,025、1,049、1,094、1,094、1,087、1,078。每張保留 `sourcePage` 與 `sourceText` 供核對；原稿的音標與語意不另行猜補或全面校訂。7000 區的進度僅保存在目前瀏覽器，不使用 TOEIC 的雲端同步。

### 重新匯入與測試

網站本身無需安裝套件；重新解析原始 PDF 需要 Python 與 `pdfplumber`：

```sh
python tools/import_7000.py /path/to/7000單\(1\).pdf 7000/vocab-data.js
node --test tests/7000.test.cjs
```

測試涵蓋資料結構、已知 PDF 解析問題、六級切換、搜尋、翻卡、篩選、分頁、進度隔離、損壞儲存資料與發音文字。使用模擬 DOM，不等同真實瀏覽器的排版、原生鍵盤操作或語音播放驗證。

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
