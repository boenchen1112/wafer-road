# Assets and credits / 素材與致謝

## Not covered by the MIT license / 不適用 MIT 授權

The following are **not** part of the MIT-licensed code and are **all rights reserved** by their respective owners. They are used in this project **with permission**:

以下素材**不**屬於 MIT 授權的程式碼範圍，著作權與相關權利均由各權利人保留，本專案經授權使用：

- **Card art** — the card faces in `public/cards/` (exported from the printed 晶圓之路 card files), including the card back. © the 晶圓之路 design team. 卡牌圖像 © 晶圓之路設計團隊。
- **Lam Research (科林研發) logo** — on the card back (`public/cards/back.webp`). The Lam Research name and logo are trademarks of Lam Research Corporation. 科林研發名稱與標誌為 Lam Research Corporation 之商標。
- **Game name, title lettering and branding** — "晶圓之路" and the look of the box/cards. 遊戲名稱、標題字樣與品牌識覺。
- **Rulebook and 製程原理 booklet text** — summarised / translated in the How to Play and Process Principles pages. 規則書與《製程原理》說明書內容。

Do not reuse these assets in other projects without permission from their owners. 未經權利人同意，請勿於其他專案中使用。

To swap the art, replace the files in `public/cards/` or edit the single manifest `CARD_ART` in `src/i18n/cards.ts`.

## Credits (from the box) / 製作名單（取自盒裝）

- 遊戲名稱：晶圓之路
- 遊戲類型：教育策略卡牌遊戲
- 設計主題：半導體製程
- 設計團隊：龔書宏、張容瑄、黃昱誠、陳博恩、沈虹
- 特別感謝：清華大學 洪秉驊
- 贊助單位：科林研發 (Lam Research) 半導體AI科學營 — 透過半導體製程探究課程，陪伴更多學生發現科學的樂趣，點燃對未來的無限想像。

## Third-party / 第三方

- [Preact](https://preactjs.com/) (MIT) — UI library.
- [Vite](https://vitejs.dev/) (MIT), [Vitest](https://vitest.dev/) (MIT), TypeScript (Apache-2.0).
- Noto Sans TC (SIL Open Font License 1.1), loaded from Google Fonts at runtime.
- Sound effects are synthesised at runtime with the Web Audio API; no audio files are used.
