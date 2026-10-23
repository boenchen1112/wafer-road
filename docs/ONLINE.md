# 線上多人模式 / Online multiplayer

[繁體中文](#繁體中文) · [English](#english)

---

## 繁體中文

線上模式由一個 **Cloudflare Worker + 每個房間一個 Durable Object**（SQLite 版，免費方案可用）提供。伺服器是權威：它執行和網頁相同的 `src/engine`、`src/ai`，只把「每位玩家自己看得到的畫面」傳給對方（自己的手牌、別人的手牌張數、牌堆張數、棄牌堆、晶圓與保護、遊戲紀錄），絕不傳送種子、亂數狀態或牌堆順序。

網頁端（GitHub Pages）在建置時讀取 `VITE_SERVER_URL`；沒有設定時，「線上遊戲」按鈕會停用並顯示「線上模式尚未設定 / Online mode not configured」。

### 一次性設定（約 10 分鐘）

> 需要：Cloudflare 帳號（免費即可）、這個 GitHub repo 的管理權限，且本分支已合併到 `main`（部署工作流程只在 `main` 上跑）。

**1. 建立 Cloudflare API Token**

1. 登入 <https://dash.cloudflare.com/>，右上角頭像 → **My Profile** → **API Tokens** → **Create Token**。
2. 在範本清單選 **Edit Cloudflare Workers**（按 **Use template**）。這個範本已包含 `Account › Workers Scripts › Edit`、`Account › Account Settings › Read`、`User › User Details › Read` 等所需權限。
   - 想自己設定也可以選 **Create Custom Token**，最少需要：`Account` · `Workers Scripts` · `Edit`，以及 `Account` · `Account Settings` · `Read`。
3. **Account Resources** 選你的帳號（Include → 你的帳號）；**Zone Resources** 若範本要求，選 `All zones` 即可（我們用 `workers.dev`，不會動到任何網域）。
4. **Continue to summary** → **Create Token**，**立刻複製 token**（只會顯示一次）。

**2. 找到 Account ID**

- 登入 dashboard 後左側選 **Workers & Pages → Overview**，右側欄會有 **Account ID**，按旁邊的複製鈕；
- 或看網址：`https://dash.cloudflare.com/<ACCOUNT_ID>/...` 中間那串 32 位十六進位字元就是。

**3. 註冊 workers.dev 子網域（若從沒用過 Workers）**

dashboard → **Workers & Pages → Overview**，若出現「Set up your workers.dev subdomain」，照指示取一個名字（例如 `boen`）。之後伺服器網址會是 `https://wafer-road.<子網域>.workers.dev`。

**4. 把兩個值加到 GitHub Secrets**

GitHub repo → **Settings → Secrets and variables → Actions → Secrets** 分頁 → **New repository secret**：

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 步驟 1 的 token |
| `CLOUDFLARE_ACCOUNT_ID` | 步驟 2 的 Account ID |

**5. 部署伺服器**

GitHub → **Actions → Deploy server (Cloudflare Workers) → Run workflow**（選 `main`）。完成後，工作流程摘要（Summary）會顯示 `Deployment URL: https://wafer-road.<子網域>.workers.dev`。之後只要改動 `server/**`、`src/engine/**`、`src/ai/**`、`src/online/**` 並推到 `main`，會自動重新部署。

> 驗證：瀏覽器打開 `https://wafer-road.<子網域>.workers.dev/health`，應看到 `{"ok":true,"service":"wafer-road"}`。

**6. 告訴網頁伺服器在哪裡**

GitHub repo → **Settings → Secrets and variables → Actions → Variables** 分頁（注意是 *Variables*，不是 Secrets）→ **New repository variable**：

| Name | Value |
| --- | --- |
| `WAFER_SERVER_URL` | `wss://wafer-road.<子網域>.workers.dev`（注意是 `wss://`，結尾不要加 `/`） |

**7. 重新部署網頁**

GitHub → **Actions → Deploy to GitHub Pages → Run workflow**。完成後打開 <https://boenchen1112.github.io/wafer-road/>，「線上遊戲 Online」分頁就會啟用。

### 怎麼玩

1. 房主：**線上遊戲 → 輸入名字 → 建立房間**，得到 4 個字母的房間代碼（只用子音，沒有 O/0/I/1 這類容易看錯的字）和分享連結 `https://boenchen1112.github.io/wafer-road/?room=ABCD`。可複製代碼／連結，手機上有「分享」按鈕。
2. 在房間大廳設定座位數（2～5）、每個座位是「開放（真人）／電腦（簡單）／電腦（普通）」、結束方式、回合計時（關閉／30／60／90 秒），人到齊後按「開始遊戲」。
3. 朋友打開連結（或輸入代碼）、取個名字就能加入，不需要帳號。
4. **斷線重連**：瀏覽器會把你的私密玩家 token 存在 `localStorage`（每個房間一份）。重新整理、斷網再連上，會自動回到原座位並取得完整狀態；其他人會看到你的連線燈號（綠＝連線中、灰＝斷線）。輪到斷線玩家時，等 20 秒（若回合計時較短則取較短者）後由「普通」電腦代打，玩家一回來就取回控制權。
5. **回合計時**：逾時由伺服器自動用「普通」電腦替該玩家出一手；倒數以伺服器時間為準。
6. 房主離開／斷線超過 10 秒，房主身分移交給下一位連線中的真人。結束後房主可按「再玩一局」回到同一個房間。
7. 房間會在閒置 2 小時、或遊戲結束 30 分鐘後自動刪除。

### 本機開發與測試

```bash
cd server && npm ci
npx wrangler dev                 # http://localhost:8787（不需要 Cloudflare 帳號）
# 另開一個終端機，在專案根目錄：
npm run dev                      # 開發模式預設連到 ws://localhost:8787
cd server && npm test            # 單元測試 + 在 workerd 內跑的 Durable Object 測試
SPAWN=1 node scripts/e2e-online.mjs   # 兩個瀏覽器的 Playwright 端對端測試
```

若要讓別的網域（例如 fork 後自己的 Pages）連線，在 `server/wrangler.toml` 加上 `[vars] ALLOWED_ORIGINS = "https://你的網域"`（逗號分隔）。預設只允許 `https://boenchen1112.github.io` 與 `localhost` / `127.0.0.1`。

### 免費方案用量備註

Workers Free 每日 10 萬次請求；WebSocket 的進站訊息以 20:1 折算請求數，一局遊戲只有幾百則訊息，一般家用／班級使用綽綽有餘。若超量，線上模式會暫時無法連線，本機遊戲不受影響。

### 疑難排解

| 狀況 | 處理 |
| --- | --- |
| 「線上遊戲」按鈕是灰的 | 建置時沒有 `WAFER_SERVER_URL`：確認是 *Variable*、值以 `wss://` 開頭，然後重新跑 Pages 部署。 |
| 部署工作流程失敗：`Authentication error` | token 範本或帳號選錯，重做步驟 1；確認 secret 名稱完全一致。 |
| 部署失敗：要求註冊 workers.dev 子網域 | 做步驟 3。 |
| 加入時顯示「找不到房間」 | 代碼打錯，或房間已閒置過久被刪除。 |
| 瀏覽器 console 出現 403 / 連不上 | 網頁網域不在允許清單；見上方 `ALLOWED_ORIGINS`。 |

---

## English

Online play runs on a **Cloudflare Worker with one Durable Object per room** (SQLite-backed, works on the free plan). The server is authoritative: it runs the same `src/engine` and `src/ai` as the browser and sends every client only what that player may see (own hand, others' hand counts, deck count, discard pile, wafers and protections, the game log). The seed, RNG state and deck order never leave the server.

The web client (GitHub Pages) reads `VITE_SERVER_URL` at build time. When it is unset, the Online button is disabled and shows "線上模式尚未設定 / Online mode not configured".

### One-time setup (about 10 minutes)

> You need: a Cloudflare account (free is fine), admin rights on this GitHub repo, and this branch merged to `main` (the deploy workflow only runs on `main`).

**1. Create a Cloudflare API token**

1. Sign in at <https://dash.cloudflare.com/>, avatar (top right) → **My Profile** → **API Tokens** → **Create Token**.
2. Pick the **Edit Cloudflare Workers** template (**Use template**). It already grants `Account › Workers Scripts › Edit`, `Account › Account Settings › Read`, `User › User Details › Read` and the other permissions wrangler needs.
   - Prefer a hand-made token? Choose **Create Custom Token** with at least `Account` · `Workers Scripts` · `Edit` and `Account` · `Account Settings` · `Read`.
3. **Account Resources**: Include → your account. **Zone Resources**: if the template asks, `All zones` is fine (we only use `workers.dev`; no domain is touched).
4. **Continue to summary** → **Create Token** and **copy the token now** (it is shown once).

**2. Find your Account ID**

- In the dashboard open **Workers & Pages → Overview**; the **Account ID** is in the right-hand column with a copy button; or
- read it from the URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/...` (32 hex characters).

**3. Register a workers.dev subdomain (first time using Workers)**

Dashboard → **Workers & Pages → Overview**. If you see "Set up your workers.dev subdomain", choose a name (e.g. `boen`). Your server will then live at `https://wafer-road.<subdomain>.workers.dev`.

**4. Add the two GitHub secrets**

GitHub repo → **Settings → Secrets and variables → Actions → Secrets** tab → **New repository secret**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 2 |

**5. Deploy the server**

GitHub → **Actions → Deploy server (Cloudflare Workers) → Run workflow** (branch `main`). When it finishes, the run summary shows `Deployment URL: https://wafer-road.<subdomain>.workers.dev`. From then on, pushes to `main` that touch `server/**`, `src/engine/**`, `src/ai/**` or `src/online/**` redeploy automatically.

> Check: open `https://wafer-road.<subdomain>.workers.dev/health` in a browser; you should see `{"ok":true,"service":"wafer-road"}`.

**6. Tell the web app where the server is**

GitHub repo → **Settings → Secrets and variables → Actions → Variables** tab (a *Variable*, not a Secret) → **New repository variable**:

| Name | Value |
| --- | --- |
| `WAFER_SERVER_URL` | `wss://wafer-road.<subdomain>.workers.dev` (note `wss://`, no trailing `/`) |

**7. Re-run the Pages deploy**

GitHub → **Actions → Deploy to GitHub Pages → Run workflow**. Then open <https://boenchen1112.github.io/wafer-road/>; the 「線上遊戲 Online」 tab is now enabled.

### How to play

1. Host: **Online → enter a name → Create room**. You get a 4-letter code (consonants only, so no O/0/I/1 mix-ups) and a link `https://boenchen1112.github.io/wafer-road/?room=ABCD`. Copy either, or use **Share** on phones.
2. In the lobby set the number of seats (2-5), what each seat is (Open human / Easy bot / Normal bot), the end mode and the turn timer (Off / 30 / 60 / 90 s), then **Start game** once every open seat is filled.
3. Friends open the link (or type the code), pick a name and they are in. No accounts.
4. **Reconnect**: your secret player token is kept in `localStorage` per room. Refreshing or losing the network rejoins your seat with the full state; everybody sees connection dots (green = connected, grey = away). If someone is away when their turn comes, a Normal bot plays for them after 20 s (or the turn timer if shorter), and they take control back as soon as they return.
5. **Turn timer**: on timeout the server auto-plays a Normal-bot move for that player. The countdown uses server time.
6. If the host leaves (or is gone for more than 10 s) the host role moves to the next connected human. After a game the host can press **Play again** to return everyone to the same room.
7. Rooms are deleted after 2 hours idle, or 30 minutes after the game ends.

### Local development and tests

```bash
cd server && npm ci
npx wrangler dev                 # http://localhost:8787 (no Cloudflare account needed)
# in another terminal, from the repo root:
npm run dev                      # dev builds default to ws://localhost:8787
cd server && npm test            # unit tests + Durable Object tests running inside workerd
SPAWN=1 node scripts/e2e-online.mjs   # two-browser Playwright end-to-end run
```

To let another origin (e.g. your own fork's Pages site) connect, add `[vars] ALLOWED_ORIGINS = "https://your.origin"` (comma separated) to `server/wrangler.toml`. By default only `https://boenchen1112.github.io` and `localhost` / `127.0.0.1` are allowed.

### Free-plan usage note

Workers Free allows 100k requests per day; incoming WebSocket messages count at a 20:1 ratio, and a game is only a few hundred messages, so family or classroom use is comfortably inside the limit. If it is ever exceeded, online play pauses; local play is unaffected.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| The Online tab is greyed out | `WAFER_SERVER_URL` was missing at build time: make sure it is a *Variable*, starts with `wss://`, then re-run the Pages deploy. |
| Deploy fails with `Authentication error` | Wrong token template or account: redo step 1 and check the secret names match exactly. |
| Deploy asks for a workers.dev subdomain | Do step 3. |
| "Room not found" when joining | Typo in the code, or the room was idle long enough to be deleted. |
| 403 / cannot connect in the browser console | The page's origin is not on the allow-list; see `ALLOWED_ORIGINS` above. |

---

## Protocol / 通訊協定 (summary)

WebSocket `wss://<server>/ws/<CODE>`, JSON text frames, each at most 1024 characters. The literal text `ping` is answered with `pong` without waking the Durable Object. `POST https://<server>/rooms` creates a room and returns `{ "code", "token" }` (the token reserves the host seat for the creator). Requests need an allowed `Origin` header.

Client → server: `join {name, token?}` · `settings {settings}` · `start` · `action {action}` · `again` · `leave`.
Server → client: `welcome {token, id}` · `room {room}` (a full redacted snapshot after every change) · `error {code, msg}`.

Full types: [`src/online/protocol.ts`](../src/online/protocol.ts). Redaction: [`src/online/view.ts`](../src/online/view.ts). Room logic: [`server/src/room.ts`](../server/src/room.ts).
