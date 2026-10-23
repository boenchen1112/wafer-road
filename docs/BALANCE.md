# 牌組平衡 / Deck Balance

[繁體中文](#繁體中文) · [English](#english)

## 繁體中文

數位版使用經電腦模擬調整後的牌組配比。規則完全不變，只調整每種卡的張數；總數仍為 68 張，可直接用於實體版再版。

### 新舊配比

| 卡牌 | 初版 | 平衡版 | | 卡牌 | 初版 | 平衡版 |
|---|---|---|---|---|---|---|
| 薄膜 | 12 | **19** | | 大停電 | 4 | **2** |
| 微影蝕刻 | 9 | **8** | | 毒氣外洩 | 4 | 4 |
| 摻雜 | 7 | 7 | | 新進工程師 | 2 | 2 |
| 金屬層 | 5 | 5 | | 通道阻塞 | 2 | **4** |
| 晶圓代工 | 3 | **2** | | 發電機 | 4 | **3** |
| 設備老舊 | 4 | 4 | | 逃生通道 | 4 | 4 |
| 曝光量錯誤 | 3 | **1** | | 年終獎金 | 3 | **2** |
| 離子佈植問題 | 2 | **1** | | **合計** | **68** | **68** |

### 結果（限時模式，Normal 電腦對戰）

| 指標 | 初版 | 平衡版 |
|---|---|---|
| 起手 4 張沒有第一階卡（薄膜／晶圓代工） | 36% | **22%** |
| 前 6 張都沒有第一階卡 | 21% | **10%** |
| 以完成晶圓結束的比例（2／3／4／5 人） | 99／84／52／19% | **100／96／88／71%** |
| 每人回合數（3–4 人） | 約 10.4 | 約 8.2 |
| 各座位勝率最大差距 | ≤ 11% | ≤ 6% |

### 主要發現

1. **第一階卡太少**：初版有三分之一的起手牌無法開始任何晶圓。薄膜增加到 19 張後降到約五分之一。
2. **4–5 人局常常牌堆用完**：初版 4 人局只有一半、5 人局只有五分之一是以完成晶圓結束。主因是後段退回卡（曝光量錯誤、離子佈植問題）與大停電在終盤反覆把玩家打回去。
3. **「約 10 回合」與「85–90% 以完成晶圓結束」無法只靠調整張數同時達成**：所有測試的牌組都落在同一條取捨曲線上，完成率越高、遊戲越短。電腦出牌比真人快很多，約 8 個真人回合在 4 人局大約是 12–15 分鐘，仍符合一堂課的時間。
4. **限制**：電腦不是真人。Normal 電腦對隨機出牌的 Easy 電腦勝率約 90%，這只代表 Normal 比隨機好，不代表真人對戰的運氣成分。建議以實體牌實際試玩後再定稿。

### 方法

- 以遊戲引擎（與正式遊戲相同的程式碼）讓 Normal 電腦自動對戰。
- 目標（與設計者討論後決定）：以 3–4 人為主要權重；約 10 回合；85–90% 以完成晶圓結束；提高拿到第一階卡的機率；座位公平。
- 限制：只改張數、不改規則；每種卡至少 1 張；製程階梯不遞增（薄膜 ≥ 微影 ≥ 摻雜 ≥ 金屬層 ≥ 4）；晶圓代工 2–5 張；攻擊類卡至少 14 張。
- 以隨機局部搜尋（每次 ±1 張或兩種卡互換 1 張）找候選牌組，再以全新亂數種子、每組 300–500 局重新驗證，並把過度擬合雜訊的配比（例如 5 張通道阻塞、1 張年終獎金）修整為合理數字。

重現結果：`npm run balance`（約 1–2 分鐘）。

---

## English

The digital version uses simulation-balanced card counts. The rules are unchanged; only the number of copies of each card changed. The deck is still 68 cards, so it can go straight to a physical reprint.

### Old vs new counts

| Card | Printed | Balanced | | Card | Printed | Balanced |
|---|---|---|---|---|---|---|
| Thin Film | 12 | **19** | | Blackout | 4 | **2** |
| Photolithography & Etch | 9 | **8** | | Toxic Gas Leak | 4 | 4 |
| Doping | 7 | 7 | | Rookie Engineer | 2 | 2 |
| Metallization | 5 | 5 | | Blocked Exit | 2 | **4** |
| Foundry | 3 | **2** | | Generator | 4 | **3** |
| Aging Equipment | 4 | 4 | | Emergency Exit | 4 | 4 |
| Exposure Error | 3 | **1** | | Year-End Bonus | 3 | **2** |
| Ion Implant Issue | 2 | **1** | | **Total** | **68** | **68** |

### Results (timed mode, Normal bots)

| Metric | Printed | Balanced |
|---|---|---|
| Opening hand with no level-1 card (Thin Film / Foundry) | 36% | **22%** |
| No level-1 card in the first 6 cards | 21% | **10%** |
| Games ending with a finished wafer (2 / 3 / 4 / 5 players) | 99 / 84 / 52 / 19% | **100 / 96 / 88 / 71%** |
| Turns per player (3–4 players) | ~10.4 | ~8.2 |
| Largest seat win-rate gap | ≤ 11% | ≤ 6% |

### Findings

1. **Level-1 cards were too rare.** A third of opening hands couldn't start any wafer. With 19 Thin Film cards it is about a fifth.
2. **4–5 player games usually ran out of deck.** Only half of 4-player and a fifth of 5-player games ended with a finished wafer. The main cause was late-step regressions (Exposure Error, Ion Implant Issue) and Blackout repeatedly knocking players back near the finish.
3. **"About 10 turns" and "85–90% finished wafers" can't both be reached by changing counts alone.** Every deck tested sits on the same trade-off curve: more finishes means shorter games. Bots play much faster than people; about 8 human turns at 4 players is roughly 12–15 minutes, which still fits a class period.
4. **Limits.** Bots aren't people. The Normal bot beats the random Easy bot about 90% of the time; that only shows Normal is better than random, not how much luck matters between humans. Playtest with physical cards before finalizing a reprint.

### Method

- Normal bots play each other using the real game engine (the same code as the live game).
- Targets, agreed with the designer: weight 3–4 players most; about 10 turns; 85–90% of games ending with a finished wafer; better odds of drawing a level-1 card; fair seats.
- Constraints: change counts only, not rules; at least 1 of every card; the process ladder never increases (Thin Film ≥ Photolithography ≥ Doping ≥ Metallization ≥ 4); 2–5 Foundry; at least 14 attack cards.
- A random local search (±1 card, or swap 1 card between two kinds) found candidate decks. Candidates were re-validated with fresh random seeds and 300–500 games per player count, and counts that were over-fitting noise (e.g. 5 Blocked Exit, 1 Year-End Bonus) were rounded to sensible numbers.

Reproduce: `npm run balance` (about 1–2 minutes).
