import type { Lang } from './strings';

export interface Section {
  h: string;
  p: string[];
}

type L<T> = Record<Lang, T>;

export const RULES: L<Section[]> = {
  'zh-TW': [
    {
      h: '目標',
      p: [
        '打造晶片的任務開始了！你能率先完成晶圓的製程，成為半導體之星嗎？每片晶圓依序要經過四道製程：薄膜 → 微影蝕刻 → 摻雜 → 金屬層。最先完成 1 片晶圓者獲勝。',
        '適合 9 歲以上、2～5 人。每位玩家有 2 片晶圓（起始為第 0 階），共 68 張牌。',
      ],
    },
    {
      h: '遊戲準備',
      p: ['洗混 68 張牌，面朝下放在中央成為牌堆。每位玩家擁有 2 片初始晶圓（第 0 階），並抽 4 張手牌。'],
    },
    {
      h: '回合進行',
      p: [
        '1. 抽牌：從牌堆抽 1 張（手牌 5 張）。',
        '2. 行動：打出 1 張牌，或棄 1 張牌。',
        '3. 手牌回到 4 張。打出與棄置的牌都放進棄牌堆（保護卡留在自己面前）。',
        '事件卡與災難卡一律由手牌打出作為行動，抽到時不會自動觸發。',
      ],
    },
    {
      h: '製程與退回',
      p: [
        '製程卡只能打在「自己的」晶圓上，且必須剛好是下一階：薄膜（0→1）、微影蝕刻（1→2）、摻雜（2→3）、金屬層（3→4，完成）。晶圓代工是萬用卡，可當作所選晶圓需要的下一階。',
        '退回卡可打在任何玩家（包含自己）的晶圓上，且晶圓必須剛好在該階：設備老舊（第 1 階→0）、曝光量錯誤（第 2 階→1）、離子佈植問題（第 3 階→2）。不符合時無法出牌。已完成的晶圓不會被任何卡影響。',
      ],
    },
    {
      h: '事件、災難與保護',
      p: [
        '大停電：所有玩家（包含出牌者）若沒有發電機，所有未完成晶圓倒退 1 步；有發電機的玩家改為棄置 1 張發電機，並不受影響。',
        '毒氣外洩：指定 1 名玩家，其所有未完成晶圓倒退 1 步；若其有逃生通道，則改為棄置 1 張逃生通道並不受影響。',
        '新進工程師：指定 1 名擁有發電機的玩家棄置 1 張發電機。通道阻塞：指定 1 名擁有逃生通道的玩家棄置 1 張逃生通道。',
        '發電機與逃生通道正面朝上放在自己面前，保護所有晶圓，可疊加；每張擋下 1 次對應事件後棄置。',
      ],
    },
    {
      h: '功能卡：年終獎金',
      p: ['打出年終獎金就是你這回合的行動：抽 2 張牌，然後選擇 (a) 打出 1 張手牌（任何合法出牌）再棄 1 張，或 (b) 直接棄 2 張。回合結束時手牌為 4 張。'],
    },
    {
      h: '結束方式（開局前擇一）',
      p: [
        '玩法一「限時」：最先完成 1 片晶圓者立即獲勝。若牌堆用完，進入最終回合：每位玩家再行動一次（不再抽牌），然後計分：晶圓每片依階數得分，第 1 階 2 分、第 2 階 3 分、第 3 階 4 分、第 0 階 0 分，兩片相加；手上每張年終獎金再加 1 分。最高分獲勝，同分則共同獲勝。',
        '玩法二「長局」：牌堆用完時，將棄牌堆重新洗牌成為新牌堆，直到有玩家完成 1 片晶圓。',
      ],
    },
    {
      h: '戰略小提示',
      p: ['分散製程在兩片晶圓上，可以降低災難損失。', '適時打出功能卡可扭轉局勢！', '年終獎金讓你牌量充足時有更多選擇。'],
    },
  ],
  en: [
    {
      h: 'Goal',
      p: [
        'The chip-making mission begins! Can you be the first to finish a wafer and become the star of semiconductors? Each wafer goes through four steps in order: Thin Film → Photolithography & Etch → Doping → Metallization. The first player to complete one wafer wins.',
        'For ages 9+ and 2–5 players. Each player has 2 wafers (starting at step 0). The deck has 68 cards.',
      ],
    },
    {
      h: 'Setup',
      p: ['Shuffle the 68 cards into a face-down deck. Every player has 2 starting wafers (step 0) and draws 4 cards.'],
    },
    {
      h: 'Your turn',
      p: [
        '1. Draw 1 card (hand is now 5).',
        '2. Action: play 1 card, or discard 1 card.',
        '3. Your hand is back to 4. Played and discarded cards go to the discard pile (protection cards stay in front of you).',
        'Event and Disaster cards are always played from your hand as your action; they never trigger when drawn.',
      ],
    },
    {
      h: 'Process and regression',
      p: [
        'Process cards are played on one of YOUR OWN wafers and only as the exact next step: Thin Film (0→1), Photolithography & Etch (1→2), Doping (2→3), Metallization (3→4, complete). Foundry is wild and counts as whichever next step the chosen wafer needs.',
        "Regression cards may target any player's wafer (yours included), and only if the wafer is at exactly that step: Aging Equipment (step 1→0), Exposure Error (2→1), Ion Implant Issue (3→2). Otherwise you cannot play them. Completed wafers can never be affected by anything.",
      ],
    },
    {
      h: 'Events, disasters and protection',
      p: [
        'Blackout: every player (including the one who played it) without a Generator moves all unfinished wafers back 1 step; each player with a Generator instead discards exactly one Generator and is unaffected.',
        'Toxic Gas Leak: target 1 player; all of their unfinished wafers move back 1 step unless they have an Emergency Exit, in which case they discard one instead and are unaffected.',
        'Rookie Engineer: target 1 player who has a Generator; they discard one. Blocked Exit: target 1 player who has an Emergency Exit; they discard one.',
        'Generators and Emergency Exits are played face-up in front of you, cover all your wafers and stack; each one blocks one matching event and is then discarded.',
      ],
    },
    {
      h: 'Function card: Year-End Bonus',
      p: ['Playing it is your action: draw 2 cards, then either (a) play 1 card from hand (any legal play) and discard 1 card, or (b) discard 2 cards. Your hand ends at 4.'],
    },
    {
      h: 'Ending the game (choose before starting)',
      p: [
        'Mode 1 "Timed": the first player to complete one wafer wins immediately. If the deck runs out, a final round is played: every player takes one more turn (no drawing), then scores: each wafer at step 1 = 2 pts, step 2 = 3 pts, step 3 = 4 pts, step 0 = 0 pts, both wafers added; +1 for each Year-End Bonus still in hand. Highest score wins; ties share the win.',
        'Mode 2 "Long game": when the deck runs out, the discard pile is reshuffled into a new deck; play continues until someone completes a wafer.',
      ],
    },
    {
      h: 'Strategy tips',
      p: ['Spreading your progress over both wafers reduces the damage of disasters.', 'Play function cards at the right time to turn the game around!', 'Year-End Bonus gives you more choices when you hold plenty of cards.'],
    },
  ],
};

export const PROCESS: L<{ title: string; intro: Section[]; steps: { h: string; items: { k: string; v: string }[]; game: string }[]; summaryH: string; summary: string[]; outro: string }> = {
  'zh-TW': {
    title: '製程原理',
    intro: [
      {
        h: '前言',
        p: [
          '我們日常生活中使用的電腦、手機、遊戲機、甚至冰箱和汽車，都離不開「半導體」。半導體晶片的製造過程，就像是一場精密的工藝展演，需要經過數千道步驟。',
          '在這款桌遊裡，我們把繁雜的製程濃縮成四個主要階段，讓玩家能精準了解並體驗「從一片矽晶圓加工至可用晶片的歷程」。這本說明書能幫助你：1. 了解半導體製程的基礎概念。2. 對照遊戲卡牌，知道遊戲中的簡化和真實世界的差異。3. 在遊戲之外，也能對半導體有更清楚的認識。',
        ],
      },
      {
        h: '製程的整體概念',
        p: [
          '半導體製程主要分為四大部分：',
          '1. 氧化與薄膜製作 ── 為晶圓加上保護層或絕緣層。',
          '2. 微影蝕刻 ── 用光罩、光阻劑與蝕刻把電路圖案刻在晶圓上。',
          '3. 摻雜與改質 ── 加入雜質改變晶體的導電性。',
          '4. 金屬化與連線 ── 鋪設金屬當作電線，完成電路連接。',
          '在遊戲卡牌中，這些步驟被簡化成 薄膜 → 微影蝕刻 → 摻雜 → 金屬層 四張製程卡。但實際上，每個大步驟裡還細分出許多不同的方法與流程。',
        ],
      },
    ],
    steps: [
      {
        h: '1. 薄膜氧化層（Oxide Thin Film）',
        items: [
          { k: '用途', v: '在矽晶圓表面生成一層二氧化矽（SiO₂）薄膜。' },
          { k: '原因', v: '二氧化矽是絕緣體，可以避免電流短路。它也能作為「保護層」，防止後續製程中的雜質亂跑。' },
          { k: '如何進行', v: '把晶圓放進高溫爐管裡，讓矽和氧氣反應，長出一層均勻的氧化層。實際也可能使用 CVD（化學氣相沉積）形成不同薄膜。' },
        ],
        game: '在遊戲卡牌裡，這個步驟叫「薄膜」，代表晶圓穿上第一層「保護衣」。',
      },
      {
        h: '2. 黃光微影與蝕刻（Photolithography and Etch）',
        items: [
          { k: '(1) 黃光微影：用途', v: '利用光把「電路圖案」轉印到晶圓上的光阻劑（photoresist）上。' },
          {
            k: '流程簡述',
            v: '在晶圓表面塗一層光阻劑（像膠水）。把光罩（Mask）蓋在晶圓上，再用光照射。光阻劑的特性會改變 → 曝光的地方會被溶解或保留下來。',
          },
          { k: '光罩種類', v: '正光阻：光照的部分會被去除。負光阻：光照的部分會被保留。' },
          { k: '(2) 蝕刻：功能', v: '移除光阻劑沒有保護到的地方，形成晶片上的精細圖案。' },
          { k: '兩種蝕刻技術', v: '溼蝕刻：用液體藥劑溶解材料。乾蝕刻：用電漿或氣體轟擊，把材料移除。' },
        ],
        game: '在遊戲卡牌裡叫「微影蝕刻」，也就是將設計好的電路圖案「轉移並刻在晶圓上」，以形成精細的電路與結構。',
      },
      {
        h: '3. 雜質摻入（Doping / Ion Implantation）',
        items: [
          { k: '用途', v: '把雜質離子打進矽晶圓裡，改變它的導電性。' },
          { k: '常見摻雜元素', v: '硼 (B) → 形成 P 型半導體，以「電洞」傳遞電流。磷 (P) → 形成 N 型半導體，以「電子」傳遞電流。' },
          { k: '原因', v: '矽本身是半導體（不易導電），但加入雜質後可以控制它的導電性，形成 MOSFET（金屬氧化物半導體場效電晶體）所需的基本材料。' },
        ],
        game: '在遊戲卡牌裡叫「摻雜」，代表矽真正開始具備「控制電流」的能力。',
      },
      {
        h: '4. 金屬化（Metallization，鍍鋁／鍍銅）',
        items: [
          { k: '用途', v: '在晶圓表面鋪上一層金屬（通常是鋁或銅），做成電路中的「電線」。' },
          { k: '原因', v: '沒有金屬線，電晶體就像孤島一樣無法互相連接。金屬化讓所有元件串起來，形成完整的電路。' },
          { k: '細節', v: '先沉積金屬，再用微影和蝕刻把金屬切割成線路。' },
        ],
        game: '在遊戲卡牌裡叫「金屬層」，代表最後的連線完成，晶片才能真正工作。',
      },
    ],
    summaryH: '總結',
    summary: ['薄膜 → 穿上保護衣', '微影蝕刻 → 把電路圖案刻進去', '摻雜 → 讓矽有導電特性', '金屬化 → 鋪上電線，完成電路'],
    outro:
      '半導體製程就像是一場超精密的「微型工程」。遊戲裡我們把流程簡化為幾張製程卡，幫助大家體驗晶圓加工的過程。但在真實世界，這些步驟會反覆進行好幾十次，才完成一個功能完整的晶圓。',
  },
  en: {
    title: 'Process Principles',
    intro: [
      {
        h: 'Preface',
        p: [
          'Computers, phones, game consoles, even refrigerators and cars in our daily lives all depend on semiconductors. Making a semiconductor chip is like a precision craft performance that takes thousands of steps.',
          'In this board game we condense the complicated process into four main stages, so players can understand and experience the journey "from a silicon wafer to a usable chip". This booklet helps you: 1. Learn the basic concepts of semiconductor manufacturing. 2. Compare the cards with the real world and see where the game simplifies. 3. Understand semiconductors better beyond the game.',
        ],
      },
      {
        h: 'The big picture',
        p: [
          'Semiconductor manufacturing has four main parts:',
          '1. Oxidation and thin-film deposition: add a protective or insulating layer to the wafer.',
          '2. Photolithography and etch: use a mask, photoresist and etching to carve the circuit pattern onto the wafer.',
          '3. Doping and modification: add impurities to change the conductivity of the crystal.',
          '4. Metallization and interconnect: lay down metal as wires to connect the circuit.',
          'In the cards these are simplified into four process cards: Thin Film → Photolithography & Etch → Doping → Metallization. In reality each big step is further divided into many different methods and procedures.',
        ],
      },
    ],
    steps: [
      {
        h: '1. Oxide Thin Film',
        items: [
          { k: 'Purpose', v: 'Grow a thin film of silicon dioxide (SiO₂) on the surface of the silicon wafer.' },
          { k: 'Why', v: 'Silicon dioxide is an insulator and prevents short circuits. It also serves as a "protective layer" that stops impurities from wandering around in later steps.' },
          { k: 'How', v: 'Put the wafer in a high-temperature furnace tube so silicon reacts with oxygen and grows an even oxide layer. In practice CVD (chemical vapor deposition) may also be used to form different films.' },
        ],
        game: 'On the cards this step is called "Thin Film": the wafer puts on its first "protective coat".',
      },
      {
        h: '2. Photolithography and Etch',
        items: [
          { k: '(1) Photolithography: purpose', v: 'Use light to transfer the "circuit pattern" onto the photoresist on the wafer.' },
          {
            k: 'In brief',
            v: 'Coat the wafer with a layer of photoresist (like glue). Cover the wafer with a mask and expose it to light. The photoresist changes under light, so the exposed areas are either dissolved or kept.',
          },
          { k: 'Types of resist', v: 'Positive resist: the illuminated parts are removed. Negative resist: the illuminated parts are kept.' },
          { k: '(2) Etch: function', v: 'Remove the areas that the photoresist does not protect, forming the fine pattern on the chip.' },
          { k: 'Two etching techniques', v: 'Wet etching: dissolve material with liquid chemicals. Dry etching: bombard with plasma or gas to remove material.' },
        ],
        game: 'On the cards this is "Photolithography & Etch": the designed circuit pattern is "transferred and carved onto the wafer" to form fine circuits and structures.',
      },
      {
        h: '3. Doping / Ion Implantation',
        items: [
          { k: 'Purpose', v: 'Shoot impurity ions into the silicon wafer to change its conductivity.' },
          { k: 'Common dopants', v: 'Boron (B) → forms P-type semiconductor, carrying current with "holes". Phosphorus (P) → forms N-type semiconductor, carrying current with "electrons".' },
          { k: 'Why', v: 'Silicon is a semiconductor (it does not conduct easily), but adding impurities lets us control its conductivity, forming the basic material needed for a MOSFET (metal-oxide-semiconductor field-effect transistor).' },
        ],
        game: 'On the cards this is "Doping": the silicon truly gains the ability to "control current".',
      },
      {
        h: '4. Metallization (aluminum / copper)',
        items: [
          { k: 'Purpose', v: 'Lay a layer of metal (usually aluminum or copper) on the wafer to make the "wires" of the circuit.' },
          { k: 'Why', v: 'Without metal wires, transistors are like isolated islands that cannot connect. Metallization links all components into a complete circuit.' },
          { k: 'Details', v: 'Deposit the metal first, then use lithography and etching to cut the metal into wiring.' },
        ],
        game: 'On the cards this is "Metallization": the final wiring is done and the chip can really work.',
      },
    ],
    summaryH: 'Summary',
    summary: ['Thin Film → puts on a protective coat', 'Photolithography & Etch → carves the circuit pattern in', 'Doping → gives silicon its conductive properties', 'Metallization → lays the wires and completes the circuit'],
    outro:
      'Semiconductor manufacturing is a super-precise "micro-engineering" project. In the game we simplify it into a few process cards to let everyone experience wafer processing. In the real world these steps are repeated dozens of times before a fully functional wafer is finished.',
  },
};
