// Prefix all public assets with Vite's base URL so paths resolve both locally
// (/) and on the GitHub Pages project page (/tl-helper/).
const BASE = import.meta.env.BASE_URL;
export const ASSETS = {
  hero: BASE + "assets/nix-frozen-citadel.png",
  world: BASE + "assets/tl-world-keyart.jpg",
  battle: BASE + "assets/tl-battlefield.jpg",
  void: BASE + "assets/tl-void-boss.jpg",
  tower: BASE + "assets/tl-night-tower.jpg",
  throne: BASE + "assets/tl-dark-throne.jpg",
};

/* Real screenshots pulled from the Discord #tnl-nix-info-and-tips channel and
   curated for the guide. Files live in public/img/nix; each is credited to the
   member who posted it. Attach one to any data entry via an `image` field. */
const NIX = BASE + "img/nix/";
export const farmSpots = [
  { src: NIX + "farm-token-monastery.jpg", title: "Forgotten Monastery — Token Burn", credit: "hittara",
    note: "Dense, all-melee cluster with two kill-zones. ~55k tokens in 30 min as a group." },
  { src: NIX + "farm-two-boss.jpg", title: "Two-Boss Spot — Gold & Mystic Chests", credit: "hittara",
    note: "Quiet farm near the Hall of Blood; two bosses plus Gold and Mystic chests on the loop." },
  { src: NIX + "farm-remnants-map.jpg", title: "Solo Remnants Farm + Escape", credit: "hittara",
    note: "Frozen Nightlands entrance. Fly into the Fastmoveline to reach the escape capsule quickly." },
  { src: NIX + "farm-castle-boss.jpg", title: "Arkeum Fortress — Castle Boss", credit: "hittara",
    note: "Fly onto the throne balcony; the boss sits behind it with a pack of mobs around it." },
  { src: NIX + "farm-driveby-boss.jpg", title: "Altar of Corruption — Drive-By Boss", credit: "hittara",
    note: "A clean drive-by boss — clearly marked zone, quick in-and-out on the way past." },
  { src: NIX + "farm-skullface.jpg", title: "Tumgir Boss-Hunt Route", credit: "hittara",
    note: "Ride the wind current past the skull-face landmark. Don't enter the cave beneath the skull — no way back out." },
];

export const researchSources = [
  {
    kind: "Official",
    tone: "frost",
    title: "Update 4.0.0 patch notes",
    url: "https://www.playthroneandliberty.com/en-us/news/articles/update-4-0-0",
    note: "Primary source for Redfrost rules, purification costs, item levels, Nix activities, bosses and system changes.",
  },
  {
    kind: "Official",
    tone: "frost",
    title: "Resistance Report — July 2026",
    url: "https://www.playthroneandliberty.com/en-us/news/articles/resistance-report-july-2026",
    note: "Dates for dungeon reductions, Character Boost additions, Tumgir Hollow changes and new Seal Key sources.",
  },
  {
    kind: "Official",
    tone: "gold",
    title: "Rise Before Ramux event",
    url: "https://www.playthroneandliberty.com/en-us/news/articles/rise-before-ramux-attendance-event",
    note: "49-day attendance track with three traited Heroic chests and a Day 28 Bellandir or Tevent weapon chest.",
  },
  {
    kind: "Video",
    tone: "void",
    title: "Aragon: complete Nix checklist",
    url: "https://www.youtube.com/watch?v=cqsgVSf2ml8",
    note: "Daily and weekly order, merchant priorities, trial floor, raid rewards and time-saving choices.",
  },
  {
    kind: "Document",
    tone: "frost",
    title: "Aragon's Nix progression checklist",
    url: "https://drive.google.com/file/d/1Zejt21hL9O29Pnvo2a741IObfIx55QWr/view",
    note: "The checklist PDF linked directly in the video's description, dated 26 June 2026.",
  },
  {
    kind: "Video",
    tone: "void",
    title: "Aragon: best Nix farm spots",
    url: "https://www.youtube.com/watch?v=nxFlQhWDjm0",
    note: "Abyss token route, Shallows of Sacrifice tower defence, PvP contracts and Path of Ascension.",
  },
  {
    kind: "Video",
    tone: "danger",
    title: "Aragon: launch-state cost breakdown",
    url: "https://www.youtube.com/watch?v=P6MhHZXB3FI",
    note: "Historical baseline recorded before later conversion recipes, supply increases and free traited Heroic rewards. Do not treat 2.1B as the current total.",
  },
  {
    kind: "Video",
    tone: "gold",
    title: "Aragon: developer response and Heroic relief",
    url: "https://www.youtube.com/watch?v=g58DiLbFN00",
    note: "Later update covering stone-conversion recipes, increased Heroic material supply and free Heroic attendance rewards.",
  },
  {
    kind: "Document",
    tone: "gold",
    title: "Nix armor sets and drop sources",
    url: "https://drive.google.com/file/d/10yFSEFJ63WsHeoR7Nh9WzrhW08Vq1QXB/view",
    note: "Linked from the armor breakdown; covers 12 sets, three cloaks, drop locations and early role predictions.",
  },
  {
    kind: "Document",
    tone: "gold",
    title: "Nix weapons reference",
    url: "https://drive.google.com/file/d/1srjhQv_Y_Y6ds_mmO1xK-mTl9Yx0j5VJ/view",
    note: "Linked from the weapon comparison; covers the new weapon pool, effects and source comparisons.",
  },
  {
    kind: "Document",
    tone: "void",
    title: "Armor and accessory Skill Cores",
    url: "https://drive.google.com/file/d/1JOqa9XKNIJPlAWCcC2wAMkgkAA4qsXdV/view",
    note: "Linked from the Skill Core transcript; maps all six source groups and potential synergies.",
  },
];

export const featureCards = [
  {
    title: "The Nix Daily Route",
    kicker: "Do these first",
    body: "Buy the daily Phantomstone and scrolls, run both Nix contracts for 10,000 Flames, then spend tokens with mastery buffs active.",
    image: ASSETS.hero,
  },
  {
    title: "Three Purple Packs Solo",
    kicker: "Scar of Sacrifice",
    body: "Roll The Candle That Melts Eternity, enter Shallows of Sacrifice and clear the short tower-defence task. Credit resets after 30 minutes.",
    image: ASSETS.tower,
  },
  {
    title: "Free Archboss Weapon Track",
    kicker: "Starts July 1",
    body: "Log in on 28 of the 49 event days for three traited Heroic selection chests and a Bellandir or Tevent weapon chest.",
    image: ASSETS.battle,
  },
];

export const deadlines = [
  {
    id: "ramux-event",
    title: "Rise Before Ramux Begins",
    target: Date.UTC(2026, 6, 1, 8, 0, 0),
    source: "official",
    confidence: "verified",
    body: "The 49-day track awards traited Calanthia weapon, armor and accessory chests on Days 7, 14 and 21, then a Bellandir or Tevent weapon chest on Day 28.",
    action: "Log in from July 1",
    tone: "danger",
  },
  {
    id: "dungeon-relief",
    title: "Elite Dungeon Difficulty Reduction",
    target: Date.UTC(2026, 6, 9, 8, 0, 0),
    source: "official",
    confidence: "verified",
    body: "Selected mechanics and minimum Combat Power requirements are being reduced. Character Boost rewards also gain missing progression items, applied retroactively.",
    action: "Arrives July 9",
    tone: "gold",
  },
  {
    id: "progression-relief",
    title: "Tumgir Hollow & Seal Key Relief",
    target: Date.UTC(2026, 6, 16, 8, 0, 0),
    source: "official",
    confidence: "verified",
    body: "Tumgir Hollow will consume Abyssal Contract Tokens and award more Sollant and growth materials. Additional free Seal Key sources arrive with Battlegrounds.",
    action: "Arrives July 16",
    tone: "frost",
  },
  {
    id: "coupon",
    title: "Coupon Code NIXLAUNCH",
    target: Date.UTC(2026, 7, 1, 6, 59, 0),
    source: "community",
    confidence: "video confirmed",
    body: "Reported rewards: 3,000 Flames, five Brilliant Skill Growth Books, one Ruins Phantomstone, 100 Stygian Pigment and a Portable Armillary Summoning Parchment.",
    action: "Redeem before July 31",
    tone: "frost",
  },
];

export const priorities = [
  {
    title: "Start the Rise Before Ramux attendance track",
    tag: "July 1",
    source: "official",
    confidence: "verified",
    body: "You need 28 logins during the 49-day event. There is no Rectify catch-up, so missing the opening days removes your safety margin.",
  },
  {
    title: "Run both Nix Contract Scrolls",
    tag: "Every day",
    source: "official",
    confidence: "verified",
    body: "Each scroll pays 5,000 Flames and contract/item Flames are exempt from the 8,000 weekly hunting and gathering cap.",
  },
  {
    title: "Buy the Phantomstone and scrolls first",
    tag: "Daily",
    source: "official",
    confidence: "verified",
    body: "The General Merchant sells one Ruins Phantomstone daily plus Allied Resistance Force scrolls. Scrolls expire after seven days, so batch carefully.",
  },
  {
    title: "Delay optional Heroic and Archboss purchases",
    tag: "Wait",
    source: "community",
    confidence: "official event",
    body: "The July attendance event now officially supplies three traited Heroic pieces and a Day 28 Archboss weapon. Avoid duplicating rewards you can select for free.",
  },
];

export const targets = [
  {
    label: "Flames of Purification",
    value: "8,000 / wk",
    note: "Hunting and gathering cap. Contract-scroll flames are exempt.",
  },
  {
    label: "Resistance Contracts",
    value: "~70 / wk",
    note: "5/day with Da Vinci's Favor, otherwise 10/day. PvE and PvP both count.",
  },
  {
    label: "Dimensional Trials",
    value: "2–7 / wk",
    note: "2 is the meaningful floor for armor runes; 7 completes the reward track.",
  },
  {
    label: "Epic Purification",
    value: "2,000 Flames",
    note: "Also costs 202,000 Sollant. Special Epic equipment costs 3,000 Flames and 404,000 Sollant.",
  },
];

export const dailyLoop = [
  {
    n: "01",
    title: "General Merchant",
    reward: "Phantomstones · Scrolls",
    body: "Buy the daily Ruins Phantomstone and Allied Resistance Force contract scrolls. Scrolls expire after seven days, so do not stockpile beyond a week.",
    priority: false,
  },
  {
    n: "02",
    title: "Amitoi Expeditions",
    reward: "Materials · Tokens",
    body: "Send all three teams before logging off. Prioritise green-arrow Amitoi for abyssal contract tokens.",
    priority: false,
  },
  {
    n: "03",
    title: "2× Nix Contract Scrolls",
    reward: "~10,000 Flames",
    body: "Each scroll gives 5,000 Flames. Roll for efficient tasks; the same activity cannot credit again until its 30-minute reward cooldown expires.",
    priority: true,
  },
  {
    n: "04",
    title: "Tumgir Hollow",
    reward: "Skill core · Gear",
    body: "Costs one daily Ruins Phantomstone. Clear as many stages as possible in 15 minutes and choose weapon-skill effects and buffs between phases.",
    priority: false,
  },
  {
    n: "05",
    title: "Resistance Contracts",
    reward: "Contract / Honor Coins",
    body: "PvE and Remnants PvP contracts use the same rights. PvP adds Honor Coins; Da Vinci's Favor doubles completion credit, reducing ten contracts to five.",
    priority: false,
  },
  {
    n: "06",
    title: "Abyss Token Burn",
    reward: "Weapon Mastery",
    body: "Stack Mastery Report, Abundance Fruit and food first. The Operation Slay the Frost Crown cluster is the current high-density community route. The Abyssal Contract buff adds +400% EXP and Sollant while it is up.",
    priority: true,
  },
];

export const weeklyLoop = [
  { title: "7 Dynamic Events", reward: "Resistance medals", body: "Medals feed your weekly merchant runs.", priority: true },
  { title: "Dimensional Trials ×2–7", reward: "Armor runes", body: "Two runs unlock the meaningful rune baseline; seven completes the reward track.", priority: true },
  { title: "Guild Raids ×7", reward: "Guild rewards", body: "Talandre Ascended bosses now, unlocked via milestones.", priority: false },
  { title: "Arch Bosses — Wed & Sat", reward: "Medals + drops", body: "Participation always gives medals; weapons are luck on top.", priority: true },
  { title: "Raids — Normal + Hard", reward: "Guaranteed Heroic", body: "Guaranteed Heroic drop plus trait pack chance. Don't skip.", priority: true },
  { title: "Hall of Illusion ×3", reward: "Gear · Currency", body: "Push Nightmare if your gear supports it for better drops.", priority: false },
  { title: "Gate of Infinity ×2", reward: "Dungeon chests", body: "Spend dungeon currency on random epic/elite dungeon chests.", priority: false },
  { title: "Weekly Merchant Shopping", reward: "Progression mats", body: "Contract Coin → trait unlock stones. Honor → runes. Guild → conversion stones. Resistance → skill books.", priority: true },
];

export const warnings = [
  {
    title: "Red Frost is temporary",
    tone: "danger",
    source: "official",
    confidence: "verified",
    body: "Redfrost is lost on death, logout or leaving Nix unless purified. The 22-slot bag has one safe slot (+1 with Da Vinci's Favor), but safe items still vanish when you log out or leave Nix.",
  },
  {
    title: "Flames cap has exceptions",
    tone: "gold",
    source: "official",
    confidence: "verified",
    body: "The weekly cap is 8,000 Flames from hunting and gathering. Contract forms and item sources do not count toward that cap.",
    image: { src: NIX + "flames-cap.jpg", credit: "dragoox_", fit: "contain", caption: "Weekly acquisition limit: 8,000 / 8,000 Flames from hunting & gathering." },
  },
  {
    title: "Purify purple gear only",
    tone: "frost",
    source: "community",
    confidence: "tested, not fully confirmed",
    body: "On a T4 item the reported defrost odds are under 1% from green, around 10% from blue and near 70% from purple — so focus purple Redfrost to push item level and skip jars, blues and greens. Community-tested numbers, not yet fully confirmed.",
  },
  {
    title: "The 2.1B trait estimate is stale",
    tone: "gold",
    source: "community",
    confidence: "needs recalculation",
    body: "That calculation predates new stone-conversion recipes, increased Heroic material supply and three free traited Heroic selection chests. It is useful launch context, not a current full-build quote.",
  },
];

export const systems = [
  {
    title: "Item Level replaces Enhancement",
    source: "official",
    confidence: "verified",
    body: "Enhancement, Transfer and Sync are gone. Power now lives in item level. Higher average level means higher-level drops up to the current ceiling.",
    image: { src: NIX + "gear-inheritance.jpg", credit: "joeblack8112", fit: "contain", caption: "The inheritance screen moving item level onto a piece (56 → 60)." },
  },
  {
    title: "Deterministic crafting",
    source: "official",
    confidence: "verified",
    body: "Nix gear crafts deterministically from purification materials at Border Zone village crafters. Epic-tier gear crafts from Epic Co-Op Dungeon rewards.",
  },
  {
    title: "Stat Conversion moved",
    source: "official",
    confidence: "verified",
    body: "Now at Mafrion's Recombinator in Herba Village and Nix Border Zone. Heroic conversion uses craftable Stat Conversion Scrolls; Chaos Prisms work as an alternative.",
  },
  {
    title: "Resonance is now Stage 4",
    source: "official",
    confidence: "verified",
    body: "Four slots, each upgradable to 10. The four must sum to 40 for max level. Resonance Stones now come from collection, abyss hunting and Nix quests. The enchant itself is pure RNG.",
    image: { src: NIX + "resonance-enchant.jpg", credit: "dragoox_", fit: "contain", caption: "Stage-4 resonance enchant — the RNG \"slot machine\" tier thresholds." },
  },
  {
    title: "Trait costs got cheaper",
    source: "official",
    confidence: "hotfix changed",
    body: "June 30 hotfix added craftable recipes for Unique Trait Unlocking Stones and Unique Trait Enhancement Stones after launch complaints about trait costs.",
  },
  {
    title: "Mystic Keys reset",
    source: "official",
    confidence: "verified",
    body: "Old Mystic Keys were deleted and converted 1:1 into Mystic Key Probability Boxes. New keys are bought from the Resistance vendor with a weekly cap.",
  },
  {
    title: "Trait costs are changing",
    source: "community",
    confidence: "recalculation pending",
    body: "The original all-gear calculation is no longer current. New recipes convert existing stones into Heroic materials, Heroic stone supply is increasing, and the attendance event supplies three pieces with three Tier 3 traits already unlocked.",
  },
  {
    title: "Skill Cores have six source groups",
    source: "community",
    confidence: "documented",
    body: "Sources split across Resin Flower crafting, Battlegrounds/Trials, field bosses, level-60 dungeons, level-55 dungeons and elite monsters. Equip two on each eligible Heroic armor or accessory piece; duplicate cores do not stack.",
  },
  {
    title: "Potential Skills are rare and transferable",
    source: "community",
    confidence: "documented",
    body: "Armor commonly rolls simple +1 skill effects; weapon potentials can materially alter skills. Move them through Inheritance Stones, but limited transfer counts and Seal Keys make speculative purchases risky.",
  },
  {
    title: "Gear inspect is live",
    source: "official",
    confidence: "verified",
    body: "The new User Info Sharing panel lets anyone inspect your equipment, traits, runes and skill setup from your character card. Great for copying a stronger player's build — but people do use it to gatekeep dungeon parties. Devs have said it is staying.",
    image: { src: NIX + "user-info-sharing.jpg", credit: "wert56", fit: "contain", caption: "The new User Info Sharing panel — inspect any player's gear, traits and runes." },
  },
];

export const intel = [
  {
    title: "The Candle That Melts Eternity",
    stat: "3 purple packs / run",
    source: "community",
    confidence: "video demonstrated",
    body: "Roll Scar of Sacrifice on a Nix scroll, enter via Shallows of Sacrifice and clear the roughly five-minute soul-turret event solo. The same activity credits again after 30 minutes.",
  },
  {
    title: "Token Burn Spot",
    stat: "~40–55k tokens / 30 min",
    source: "community",
    confidence: "tested",
    body: "Mob cluster near the Operation Slay the Frost Crown event. All-melee, no CC, dense spawns. Buff up and group farm.",
  },
  {
    title: "Tilted Towers",
    stat: "Purify landing",
    source: "community",
    confidence: "tested",
    body: "Strong landing zone for purple purify drops. High density, fast respawn. Golden rune means armor chaos rune chest.",
  },
  {
    title: "Frozen Spellbook Merchant",
    stat: "Rare materials",
    source: "official",
    confidence: "verified",
    body: "Hidden vendor on the Border Zone airship, night cycle only. The interaction bug was fixed in the June 25 hotfix.",
  },
  {
    title: "Goblin Leyline Detector",
    stat: "Buried chests",
    source: "official",
    confidence: "verified",
    body: "Field item that finds treasure chests buried in the ground across Nix and Remnants of Nix.",
  },
  {
    title: "Flamakan's Gesture",
    stat: "Ice Cocoon chests",
    source: "official",
    confidence: "verified",
    body: "Pull out a torch to open Ice Cocoon hidden treasure chests scattered through the tundra.",
  },
  {
    title: "Kill Mobs, Skip Chests",
    stat: "Community estimate",
    source: "community",
    confidence: "unconfirmed",
    body: "Community testing suggests straight mob-killing outpaces chest-opening by a wide margin. Treat the exact ratio as an estimate, not a confirmed drop rate.",
  },
  {
    title: "War Bosses = Upgraded Elites",
    stat: "Random spawn",
    source: "community",
    confidence: "tested",
    body: "3★ war-boss versions of field elites spawn at regular elite locations. If one appears, call it immediately so everyone can tag.",
  },
  {
    title: "Trait Stones = AH Gold",
    stat: "High demand",
    source: "community",
    confidence: "market watch",
    body: "Trait Stones and inheritance passives are strong Auction House sellers while people rebuild around the trait overhaul.",
  },
  {
    title: "Path of Ascension before Character Boost",
    stat: "~7,000 CP free route",
    source: "community",
    confidence: "video demonstrated",
    body: "The free Path of Ascension route can reach roughly 7,000 Combat Power, enough for the new co-op dungeons. Compare that with the paid boost before spending on a new character.",
  },
  {
    title: "Unlock the Border Zone waypoint",
    stat: "Guild boss access",
    source: "community",
    confidence: "tested",
    body: "Enter the mountain and take the elevator; the teleport stone unlocks on arrival. Doing this early avoids a long detour when the Guild Field Boss appears.",
  },
];

export const builds = [
  {
    label: "BiS Cloak",
    body: "Breath of the Boundless Sky stays best. It crafts from Dimensional Essence dropping in the new co-op dungeon — the recipe needs 30, so budget ~30 runs. The three new cloaks underwhelm.",
  },
  {
    label: "Weapons",
    body: "Cold-blooded dagger likely BiS. Arctic Roar staff is strong for group damage-taken debuff. Abyss orb was nerfed; Tevent remains usable but power-crept. The archboss bow's Ice Dragon Strike is bringing the flash-wave meta back.",
  },
  {
    label: "PvE Armor",
    body: "Heavy-attack set is the standout: heavy-attack damage and skill damage with no positional requirement. Fifth slot can be a Heroic skill-core piece.",
  },
  {
    label: "Healers",
    body: "Seeker → Prayer of Salvation. Oracle → Frigid Melody. Tanks remain flexible while more testing lands.",
  },
];

export const roadmap = [
  { when: "July 1", title: "Rise Before Ramux", body: "49-day attendance track. Days 7/14/21 award traited Heroic selection chests; Day 28 awards an Item Level 55 Bellandir or Tevent weapon.", status: "live" },
  { when: "July 9", title: "Dungeon & Character Boost adjustments", body: "Elite-tier mechanics and minimum Combat Power are reduced. Missing Character Boost progression items are added retroactively.", status: "next" },
  { when: "July 16", title: "Tumgir Hollow & Seal Key improvements", body: "Tumgir gains Abyssal Token consumption plus better Sollant/material rewards. Battlegrounds add free Seal Key acquisition sources.", status: "next" },
  { when: "July 30", title: "Dragon Knight Ramux", body: "Ramux arrives with Atirat. The encounter uses terrain, timed crowd control and battlefield weapons before the mounted fight becomes a frenzied second phase.", status: "next" },
  { when: "August", title: "Colossus Vegamor", body: "Moving battlefield boss, Castle Siege overhaul and Tax Delivery updates", status: "future" },
  { when: "September", title: "Solo Co-op & Dynamic Events", body: "Solo mode for co-op dungeons and dynamic event overhaul", status: "future" },
  { when: "~October", title: "Nix Season 2", body: "Cap progression toward Level 90 and a new story chapter", status: "future" },
];

export const sourceLegend = [
  { label: "Official", body: "From patch notes, hotfixes, events or in-game systems.", tone: "frost" },
  { label: "Community tested", body: "Repeated player testing, still worth rechecking after hotfixes.", tone: "void" },
  { label: "Unconfirmed", body: "Useful lead, not guaranteed. Keep it visually separate.", tone: "danger" },
];
