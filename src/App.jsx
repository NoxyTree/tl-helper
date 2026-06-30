import { useState, useEffect, useMemo } from "react";

/* ════════════════════════════════════════════════════════════════
   TL HELPER — community guide / briefing board for Throne and Liberty.
   Currently covers the Nix expansion; built to grow into more sections.
   Reframed from checklist → reference board.
   Visual language ported from Claude Design (.dc.html).
   Data validated against official 4.0.0 notes + June 25 hotfix.
   Edit the DATA blocks below to update content.
   ════════════════════════════════════════════════════════════════ */

const C = {
  abyss: "#0B1120", permafrost: "#141E30", panel: "rgba(20,30,48,0.8)",
  glacial: "#6BA3BE", aurora: "#4ac0a0", redFrost: "#C44D52", redSoft: "#e8a0a3",
  flame: "#D4A04A", snow: "#C8D1DA", mid: "#8a9bb0", slate: "#4E6278", faint: "#2a3a50",
};
const F = {
  display: "'Chakra Petch', sans-serif",
  body: "'Inter', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

/* Hero background. Drop in an in-game screenshot (a wide Nix vista) or an
   AI-generated ice/dragon scene. Leave "" to keep the pure aurora+mountains
   look. Use a hosted URL or a data URI; aim for a dark image with empty sky
   up top so the title stays readable. */
const HERO_BG = ""; // e.g. "https://yoursite.com/nix-hero.jpg"

/* ── DEADLINES (live countdowns) ───────────────────────────────── */
const DEADLINES = [
  { id: "convert", title: "Convert Old Materials", target: Date.UTC(2026, 6, 16, 8, 0, 0),
    body: "Extraction Stones, Noble Resonance Stones, retired Lithographs + the Adventure Coin → Unlock Stone recipe. Craft via Miscellaneous → Limited-Time Event.", weight: "high" },
  { id: "archboss", title: "Double Archboss Event", target: Date.UTC(2026, 6, 16, 8, 0, 0),
    body: "All four Ascended Archbosses spawning at 2× rate. Farm participation rewards (special resistance medals) while it lasts.", weight: "high" },
  { id: "coupon", title: "Coupon Code NIXREVEAL2026", target: Date.UTC(2026, 7, 1, 6, 59, 0),
    body: "Free Purification Points ×3000, Brilliant Skill Growth Book ×5, Ruins Phantomstone, Abyssal Pigment ×100, Portable Celestial Orb. Main Menu → Coupon.", weight: "normal" },
];

/* ── PRIORITIES (if you only do a few things) ──────────────────── */
const PRIORITIES = [
  { title: "Run 2 Nix Contract Scrolls daily", why: "Your primary Flames of Purification income — and it's exempt from the 8,000 weekly cap, so it's the most efficient progression you can do.", tag: "Every day" },
  { title: "Redeem NIXREVEAL2026", why: "Free purification points and skill books for zero effort. Expires July 31.", tag: "Once" },
  { title: "Hit the Wed & Sat Archbosses", why: "The only archboss windows that exist now — scaled to 60, spawning at 2× until July 16. Participation always pays out resistance medals; the weapon drop itself is luck, not a guarantee, so show up but don't count on it.", tag: "Wed / Sat" },
  { title: "Hold off on Heroic upgrades", why: "A free Heroic weapon, armor and accessory are coming as login/attendance rewards. Don't sink AH materials or Lucent into upgrading or trait-unlocking your current Heroics before that set lands.", tag: "Hold" },
];

/* ── THE LOOP ──────────────────────────────────────────────────── */
const DAILY = [
  { n: 1, title: "Sundries Merchant", why: "Buy all Ruins Phantomstones (entry for Tamar Hollow) and Allied Resistance contract scrolls. The foundation of the whole loop — easy to skip if you rush.", reward: "Phantomstones · Scrolls" },
  { n: 2, title: "Set Amitoi Expeditions", why: "Send all three teams before you log off — they run on timers. Prioritise green-arrow Amitoi for abyssal contract tokens.", reward: "Materials · Tokens" },
  { n: 3, title: "2× Nix Contract Scrolls", why: "Each gives a targeted farm quest worth ~5,000 Flames. 30-min cooldown before the same task re-credits. This is your main Flames income.", reward: "~10,000 Flames", high: true },
  { n: 4, title: "Tamar Hollow Dungeon", why: "Costs a Ruins Phantomstone. Solo-friendly 15-min event — pick a skill core between phases and preview new-weapon effects before committing.", reward: "Skill core · Gear" },
  { n: 5, title: "Resistance Contracts", why: "PvE or PvP versions give the same contract rights — your call. PvP adds Honor Coins. Da Vinci's Favor halves the requirement to 5/day.", reward: "Contract / Honor Coins" },
  { n: 6, title: "Abyss Token Burn", why: "Stack Mastery Report + Abundance Fruit + food first, then group-farm. Mastery from the burn feeds your equipped weapon (≤220).", reward: "Weapon Mastery" },
];

const WEEKLY = [
  { title: "7 Dynamic Events", why: "Resistance medals — the currency behind your weekly merchant runs.", reward: "Resistance medals", high: true },
  { title: "Dimensional Trials ×2–7", why: "2/week minimum unlocks all the new armor runes (6,000 pts). Up to 7 for the full reward track.", reward: "Armor runes", high: true },
  { title: "Guild Raids ×7", why: "Talandre Ascended bosses now, unlocked via Milestones. Normal Laslan/Stonegard bosses were removed.", reward: "Guild rewards" },
  { title: "Arch Bosses — Wed & Sat", why: "Scaled to 60, no normal versions anymore. Participation always gives special resistance medals; the weapon drop is luck on top. 2× spawns until July 16.", reward: "Medals (+ lucky drop)" },
  { title: "Raids — Normal + Hard", why: "Guaranteed Heroic drop plus a trait pack (small chance at a high-value sellable trait). Don't skip.", reward: "Guaranteed Heroic", high: true },
  { title: "Hall of Illusion ×3", why: "Solo dungeon. Push Nightmare if your gear supports it for better drops.", reward: "Gear · Currency" },
  { title: "Gate of Infinity ×2", why: "Spend the dungeon currency on chests from random epic/elite dungeons.", reward: "Dungeon chests" },
  { title: "Weekly Merchant Shopping", why: "Contract Coin → trait unlock stones first. Honor → runes. Guild → conversion stones. Resistance → brilliant skill books + monthly inheritance stones.", reward: "Progression mats", high: true },
];

const WEEKLY_TARGETS = [
  { label: "Flames of Purification", value: "8,000 / wk", note: "Hunting & gathering cap. Contract-scroll flames are exempt — prioritise those." },
  { label: "Resistance Contracts", value: "~70 / wk", note: "5/day with Da Vinci's Favor, otherwise 10/day. PvE and PvP both count." },
  { label: "Dimensional Trials", value: "2–7 / wk", note: "2 is the meaningful floor (all armor runes); 7 completes the track." },
];

/* ── SYSTEMS ───────────────────────────────────────────────────── */
const SYS_WARN = [
  { icon: "⚠", color: C.redFrost, text: "Red Frost is lost on death, logout, or leaving Nix unless purified. Safety Bag = 22 slots, 1 safety slot (+1 from membership), non-expandable — and even bagged items vanish if you leave Nix or exit." },
  { icon: "⚠", color: C.flame, text: "Weekly cap is 8,000 Flames from hunting & gathering. Flames from contract forms and items don't count toward it." },
  { icon: "ℹ", color: C.glacial, text: "Only purify purple gear. Skip jars, blues and greens — the success odds aren't worth the cost." },
];

const SYS_CHANGES = [
  { title: "Item Level replaces Enhancement", body: "Enhancement, Transfer and Sync are gone — power now lives in item level. Higher average level → higher-level drops (up to 80). You don't need to level a piece to roll higher; the system reads your average." },
  { title: "Deterministic crafting", body: "Nix gear crafts deterministically from purification materials at Border Zone village crafters. Epic-tier gear crafts deterministically from Epic Co-Op Dungeon rewards. A real escape from pure RNG." },
  { title: "Stat Conversion moved", body: "Now at \"Mafrion's Recombinator\" (the old Skill Core device) in Herba Village and Nix Border Zone. Heroic conversion uses craftable Stat Conversion Scrolls; Chaos Prisms work as an alternative." },
  { title: "Resonance is now Stage 4", body: "Four slots, each upgradable to 10 — the four must sum to 40 for max level. Resonance Stones come from Rubbing Collection, Abyss Hunting and Nix quests now, not Material Transmutation." },
  { title: "Material Transmutation trimmed", body: "Restructured from 5 stages to 3, with adjusted requirements. No longer supplies Trait Resonance Stones." },
  { title: "Check your mailbox", body: "Compensation for removed systems: Chaos Prisms scaled by old Heroic level (2 → 264), one Skill Core per Heroic armor/accessory owned, and one Mystic Key Probability Box per old Mystic Key." },
];

/* ── FARM & SECRETS ────────────────────────────────────────────── */
const SECRETS = [
  { title: "Token Burn Spot", source: "community", body: "Mob cluster near the \"Operation Slay the Frost Crown\" event — all-melee, no CC, dense spawns. Buff up and group-farm.", stat: "~40–55k tokens / 30 min" },
  { title: "Tilted Towers", source: "community", body: "Best landing zone for purple purify drops. High density, fast respawn. A golden rune = an armor chaos rune chest.", stat: "Purify landing" },
  { title: "Frozen Spellbook Merchant", source: "official", body: "Hidden vendor on the Border Zone airship, night cycle only. The June 25 hotfix fixed its interaction bug — confirmed live.", stat: "Rare materials" },
  { title: "Goblin Leyline Detector", source: "official", body: "Field item that finds treasure chests buried in the ground across Nix and Remnants of Nix.", stat: "Buried chests" },
  { title: "Flamakan's Gesture", source: "official", body: "Pull out a torch to open Ice Cocoon hidden treasure chests scattered through the tundra.", stat: "Ice Cocoon chests" },
  { title: "Path of Ascension", source: "official", body: "Free gear at item level 45 (~7,000 CP) — fast early power for new or returning players, may make the paid boost unnecessary.", stat: "Free ~7,000 CP" },
];

const BIS = [
  { label: "BiS Cloak", text: "Breath of the Boundless Sky stays best — craftable from Dimensional Essence, which drops roughly every 2nd co-op dungeon run. The 3 new cloaks underwhelm." },
  { label: "Weapons", text: "Cold-blooded dagger (detonation-mark style) likely BiS; Arctic Roar staff is group BiS (+10% damage-taken debuff). Abyss orb was nerfed; Tevent still usable but power-crept." },
  { label: "PvE armor", text: "Heavy-attack set (40% heavy-attack dmg + 50 skill dmg, no positional requirement). 5th slot = a heroic piece for its skill core." },
  { label: "Healers", text: "Seeker → Prayer of Salvation. Oracle → Frigid Melody. Tanks stay flexible." },
];

/* ── WHAT'S NEXT ───────────────────────────────────────────────── */
const ROADMAP = [
  { when: "JUNE 25", now: true, title: "Nix is Here", body: "Gauntlets · Level 60 cap · Purification system · new zones & storyline", op: 1 },
  { when: "JULY", now: false, title: "Archboss Ramux — Dragon Rider", body: "New Archboss + 10 weapons · Battleground mode · Dimensional Trials for Nix dungeons", op: 0.4 },
  { when: "AUGUST", now: false, title: "Colossus Vegamor — Moving Battlefield", body: "~200m boss you attack by body part · Castle Siege overhaul · Tax Delivery updates", op: 0.25 },
  { when: "SEPTEMBER", now: false, title: "Solo Co-op & Dynamic Events", body: "Solo mode for co-op dungeons · dynamic events overhaul", op: 0.15 },
  { when: "~OCTOBER", now: false, title: "Nix Season 2", body: "Cap progression toward Level 90 · new story chapter", op: 0.1 },
];

/* ── countdown helper ──────────────────────────────────────────── */
function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const diff = target - now;
  if (diff <= 0) return { expired: true, d: 0, h: 0, m: 0 };
  return {
    expired: false,
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
  };
}

/* ── style helpers ─────────────────────────────────────────────── */
const card = { background: C.panel, border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8 };
const bar = { width: 3, height: 22, borderRadius: 2 };
const sectionTitle = { fontFamily: F.display, fontWeight: 700, fontSize: 18, letterSpacing: 3, textTransform: "uppercase", color: C.snow };
const eyebrow = (color) => ({ fontFamily: F.display, fontWeight: 600, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color });

function SourceBadge({ source }) {
  const official = source === "official";
  return (
    <span style={{ fontFamily: F.mono, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
      background: official ? "rgba(107,163,190,0.12)" : "rgba(212,160,74,0.12)",
      color: official ? C.glacial : C.flame,
      border: `1px solid ${official ? "rgba(107,163,190,0.25)" : "rgba(212,160,74,0.25)"}` }}>
      {official ? "Official" : "Community"}
    </span>
  );
}

/* ── countdown card ────────────────────────────────────────────── */
function DeadlineCard({ d }) {
  const c = useCountdown(d.target);
  const urgent = !c.expired && c.d < 7;
  const accent = c.expired ? C.slate : urgent ? C.redFrost : C.flame;
  return (
    <div style={{ background: "rgba(196,77,82,0.05)", border: `1px solid ${accent}33`, borderRadius: 10, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, animation: urgent ? "pulseGlow 4s ease-in-out infinite" : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 15, color: C.snow }}>{d.title}</div>
        {c.expired
          ? <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>CLOSED</span>
          : (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {[[c.d, "d"], [c.h, "h"], [c.m, "m"]].map(([v, u], i) => (
                <div key={i} style={{ textAlign: "center", minWidth: 30 }}>
                  <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 18, color: accent, lineHeight: 1 }}>{String(v).padStart(2, "0")}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 9, color: C.slate, marginTop: 2 }}>{u}</div>
                </div>
              ))}
            </div>
          )}
      </div>
      <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.mid, lineHeight: 1.5 }}>{d.body}</div>
    </div>
  );
}

/* ── purification flow node ────────────────────────────────────── */
function FlowNode({ children, label, sub, color, glow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, maxWidth: 150 }}>
      <div style={{ width: 52, height: 52, background: `${color}1a`, border: `1px solid ${color}4d`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", animation: glow ? `${glow} 3s ease-in-out infinite` : "none" }}>{children}</div>
      <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, color: C.snow }}>{label}</span>
      <span style={{ fontFamily: F.body, fontSize: 10, color: C.slate, textAlign: "center" }}>{sub}</span>
    </div>
  );
}
const Arrow = () => <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "0 2px", marginTop: -22 }}><svg width="28" height="12" viewBox="0 0 28 12"><path d="M0 6h24M20 1l6 5-6 5" stroke={C.slate} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>;

const TABS = [
  { id: "now", label: "Right Now", dot: C.redFrost },
  { id: "loop", label: "The Loop", dot: null },
  { id: "systems", label: "Systems", dot: null },
  { id: "secrets", label: "Farm & Secrets", dot: null },
  { id: "next", label: "What's Next", dot: null },
];

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
@keyframes snowfall { 0%{transform:translateY(-10px) translateX(0);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(100vh) translateX(40px);opacity:0} }
@keyframes snowfall2 { 0%{transform:translateY(-10px) translateX(0);opacity:0} 10%{opacity:.7} 90%{opacity:.7} 100%{transform:translateY(100vh) translateX(-30px);opacity:0} }
@keyframes auroraShift { 0%{transform:translateX(-5%) scaleY(1);opacity:.5} 50%{transform:translateX(5%) scaleY(1.15);opacity:.7} 100%{transform:translateX(-5%) scaleY(1);opacity:.5} }
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 15px rgba(196,77,82,.12)} 50%{box-shadow:0 0 24px rgba(196,77,82,.28)} }
@keyframes frostPulse { 0%,100%{opacity:.03} 50%{opacity:.07} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes flamePulse { 0%,100%{filter:drop-shadow(0 0 6px rgba(212,160,74,.3))} 50%{filter:drop-shadow(0 0 12px rgba(212,160,74,.55))} }
@keyframes redGlow { 0%,100%{text-shadow:0 0 20px rgba(196,77,82,.5),0 0 40px rgba(196,77,82,.2)} 50%{text-shadow:0 0 40px rgba(196,77,82,.7),0 0 80px rgba(196,77,82,.4)} }
@keyframes timelinePulse { 0%,100%{box-shadow:0 0 0 0 rgba(107,163,190,.4)} 50%{box-shadow:0 0 0 8px rgba(107,163,190,0)} }
.nix-scroll::-webkit-scrollbar{width:6px}.nix-scroll::-webkit-scrollbar-track{background:#0B1120}.nix-scroll::-webkit-scrollbar-thumb{background:#2a3a50;border-radius:3px}
`;

export default function TLHelper() {
  const [tab, setTab] = useState("now");

  const snow = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    size: 1 + Math.random() * 3, left: Math.random() * 100, delay: Math.random() * 15,
    dur: 10 + Math.random() * 15, op: 0.2 + Math.random() * 0.5, anim: i % 2 === 0 ? "snowfall" : "snowfall2",
  })), []);

  // nearest live deadline for the header pill
  const nearest = useCountdown(Math.min(...DEADLINES.map(d => d.target)));

  return (
    <div className="nix-scroll" style={{ background: C.abyss, minHeight: "100vh", fontFamily: F.body, color: C.snow, position: "relative", overflowX: "hidden" }}>
      <style>{STYLES}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
        {snow.map((s, i) => (
          <div key={i} style={{ position: "absolute", top: -10, left: `${s.left}%`, width: s.size, height: s.size, background: `rgba(200,209,218,${s.op})`, borderRadius: "50%", animation: `${s.anim} ${s.dur}s linear ${s.delay}s infinite` }} />
        ))}
      </div>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, background: "radial-gradient(ellipse at 20% 0%, rgba(107,163,190,0.03) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(107,163,190,0.02) 0%, transparent 50%)", animation: "frostPulse 8s ease-in-out infinite" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 2 }}>

        {/* HERO */}
        <div style={{ position: "relative", width: "100%", height: 240, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 24 }}>
          {HERO_BG && (
            <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
              <img src={HERO_BG} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(0.8) brightness(0.7)" }} />
              {/* bottom-heavy navy scrim keeps the title legible + blends into the mountains */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,17,32,0.55) 0%, rgba(11,17,32,0.3) 45%, rgba(11,17,32,0.92) 100%)" }} />
              {/* faint glacial tint to pull the screenshot toward the palette */}
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, rgba(107,163,190,0.12), transparent 60%)" }} />
            </div>
          )}
          <div style={{ position: "absolute", top: 0, left: "-10%", width: "120%", height: "100%", zIndex: 0 }}>
            <div style={{ position: "absolute", top: "-20%", left: "10%", width: "80%", height: "80%", background: "linear-gradient(135deg, rgba(107,163,190,0.12), rgba(74,200,160,0.08) 30%, rgba(107,163,190,0.05) 60%, rgba(130,100,200,0.08))", filter: "blur(60px)", animation: "auroraShift 12s ease-in-out infinite", borderRadius: "50%" }} />
            <div style={{ position: "absolute", top: 0, left: "30%", width: "50%", height: "50%", background: "linear-gradient(90deg, rgba(74,200,160,0.06), rgba(107,163,190,0.1) 50%, rgba(160,120,220,0.06))", filter: "blur(80px)", animation: "auroraShift 16s ease-in-out infinite reverse", borderRadius: "50%" }} />
          </div>
          <svg style={{ position: "absolute", bottom: 0, left: 0, width: "100%", zIndex: 1 }} viewBox="0 0 1200 160" preserveAspectRatio="none">
            <polygon points="0,160 0,90 80,60 160,80 240,40 320,65 400,25 480,55 540,20 620,50 700,35 780,60 860,25 940,50 1000,38 1080,65 1140,48 1200,72 1200,160" fill="#0d1628" opacity="0.7" />
            <polygon points="0,160 0,115 60,100 140,108 200,80 280,100 360,70 440,90 500,65 580,88 640,75 720,95 800,68 880,85 940,72 1020,98 1100,80 1200,105 1200,160" fill="#101c2e" opacity="0.85" />
            <polygon points="0,160 0,135 100,125 180,132 250,115 340,128 420,112 500,126 580,118 660,132 740,115 820,128 900,120 980,135 1060,125 1140,138 1200,130 1200,160" fill="#141E30" />
            <polygon points="400,25 414,40 386,40" fill="rgba(200,209,218,0.2)" />
            <polygon points="540,20 555,37 525,37" fill="rgba(200,209,218,0.18)" />
            <polygon points="860,25 874,40 846,40" fill="rgba(200,209,218,0.2)" />
          </svg>
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 11, letterSpacing: 5, textTransform: "uppercase", color: C.slate }}>Throne and Liberty · Community Guide</div>
            <h1 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 48, letterSpacing: 6, textTransform: "uppercase", margin: 0, color: C.snow, lineHeight: 1, textShadow: "0 0 60px rgba(107,163,190,0.2), 0 2px 4px rgba(0,0,0,0.5)" }}>TL HELPER</h1>
            <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: C.glacial }}>Nix Field Guide · The Frozen Divide</div>
          </div>
        </div>

        {/* HEADER: live deadline pill + tabs (replaces personal progress) */}
        <div style={{ padding: "0 24px 16px", position: "sticky", top: 0, zIndex: 100, background: "linear-gradient(180deg, #0B1120 0%, #0B1120 85%, transparent 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, justifyContent: "center" }}>
            <span style={{ fontFamily: F.display, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.slate }}>Next deadline</span>
            <span style={{ fontFamily: F.mono, fontSize: 12, color: nearest.expired ? C.slate : (nearest.d < 7 ? C.redFrost : C.flame) }}>
              {nearest.expired ? "—" : `Convert materials · ${nearest.d}d ${String(nearest.h).padStart(2, "0")}h ${String(nearest.m).padStart(2, "0")}m`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 2, background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.08)", borderRadius: 8, padding: 4 }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 6, background: active ? "rgba(107,163,190,0.12)" : "transparent", color: active ? C.snow : C.slate, fontFamily: F.display, fontWeight: active ? 600 : 500, fontSize: 12.5, letterSpacing: 0.5, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {t.dot && <div style={{ width: 6, height: 6, background: t.dot, borderRadius: "50%", boxShadow: `0 0 6px ${t.dot}80` }} />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT NOW ── */}
        {tab === "now" && (
          <div style={{ padding: "0 24px 60px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, background: C.redFrost, borderRadius: "50%", boxShadow: "0 0 8px rgba(196,77,82,0.6)" }} />
              <span style={eyebrow(C.redFrost)}>Deadlines</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 36 }}>
              {DEADLINES.map(d => <DeadlineCard key={d.id} d={d} />)}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.flame }} />
              <span style={sectionTitle}>If You Only Do Four Things</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {PRIORITIES.map((p, i) => (
                <div key={i} style={{ ...card, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 15, color: C.snow }}>{p.title}</div>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.flame, whiteSpace: "nowrap" }}>{p.tag}</span>
                  </div>
                  <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.mid, lineHeight: 1.5 }}>{p.why}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── THE LOOP ── */}
        {tab === "loop" && (
          <div style={{ padding: "0 24px 60px" }}>
            {/* Weekly targets strip (informational, not tracked) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
              {WEEKLY_TARGETS.map((t, i) => (
                <div key={i} style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 22, color: C.glacial, marginBottom: 6 }}>{t.value}</div>
                  <div style={{ fontFamily: F.body, fontSize: 11.5, color: C.mid, lineHeight: 1.45 }}>{t.note}</div>
                </div>
              ))}
            </div>

            {/* Daily routine */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.glacial }} />
              <span style={sectionTitle}>Daily Routine</span>
              <span style={{ fontFamily: F.display, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.slate, marginLeft: 4 }}>The Efficient Order</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
              {DAILY.map(t => (
                <div key={t.n} style={{ ...card, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", borderColor: t.high ? "rgba(212,160,74,0.25)" : "rgba(107,163,190,0.1)" }}>
                  <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 13, color: t.high ? C.flame : C.slate, width: 18, textAlign: "center", flexShrink: 0, paddingTop: 1 }}>{t.n}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 15, color: C.snow }}>{t.title}</span>
                      <span style={{ fontFamily: F.mono, fontSize: 10.5, color: t.high ? C.flame : C.glacial, whiteSpace: "nowrap", flexShrink: 0 }}>{t.reward}</span>
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.mid, lineHeight: 1.5, marginTop: 3 }}>{t.why}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Weekly objectives */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.flame }} />
              <span style={sectionTitle}>Weekly Objectives</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {WEEKLY.map((t, i) => (
                <div key={i} style={{ ...card, padding: "14px 16px", borderColor: t.high ? "rgba(212,160,74,0.25)" : "rgba(107,163,190,0.1)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
                    <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 14, color: C.snow }}>{t.title}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: t.high ? C.flame : C.glacial, whiteSpace: "nowrap", flexShrink: 0 }}>{t.reward}</span>
                  </div>
                  <div style={{ fontFamily: F.body, fontSize: 12, color: C.mid, lineHeight: 1.45 }}>{t.why}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SYSTEMS ── */}
        {tab === "systems" && (
          <div style={{ padding: "0 24px 60px" }}>
            {/* Purification */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ ...bar, background: "linear-gradient(180deg, #C44D52, #D4A04A)" }} />
                <span style={sectionTitle}>Purification</span>
                <span style={{ fontFamily: F.display, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.slate, marginLeft: 4 }}>The Core Loop</span>
              </div>
              <div style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 10, padding: "28px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap" }}>
                  <FlowNode label="Kill Mobs" sub="Nix field enemies" color={C.redFrost}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill={C.redFrost} /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke={C.redFrost} strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </FlowNode>
                  <Arrow />
                  <FlowNode label="Red Frost" sub="Special inventory" color={C.redFrost} glow="redGlow">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l2 7h7l-5.5 4 2 7L12 17l-5.5 4 2-7L3 10h7z" fill={C.redFrost} opacity="0.8" /></svg>
                  </FlowNode>
                  <Arrow />
                  <FlowNode label="Armillary Sphere" sub="Purify station" color={C.glacial}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={C.glacial} strokeWidth="1.5" /><circle cx="12" cy="12" r="4" stroke={C.glacial} strokeWidth="1" /><circle cx="12" cy="12" r="1.5" fill={C.glacial} /></svg>
                  </FlowNode>
                  <Arrow />
                  <FlowNode label="Purify" sub="Chance-based" color={C.flame} glow="flamePulse">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22c-4-3-7-6.5-7-10.5C5 7 8.5 4 12 2c3.5 2 7 5 7 9.5 0 4-3 7.5-7 10.5z" fill={C.flame} opacity="0.85" /></svg>
                  </FlowNode>
                  <Arrow />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, maxWidth: 150 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ width: 44, height: 44, background: "rgba(212,160,74,0.1)", border: "1px solid rgba(212,160,74,0.25)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="4" y="2" width="12" height="16" rx="2" stroke={C.flame} strokeWidth="1.2" /><path d="M7 6h6M7 9h4" stroke={C.flame} strokeWidth="1" strokeLinecap="round" /></svg>
                      </div>
                      <div style={{ width: 44, height: 44, background: "rgba(107,163,190,0.1)", border: "1px solid rgba(107,163,190,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="5" stroke={C.glacial} strokeWidth="1.2" /><path d="M10 7v3l2 2" stroke={C.glacial} strokeWidth="1" strokeLinecap="round" /></svg>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14 }}>
                      <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 11, color: C.flame }}>Gear</span>
                      <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 11, color: C.glacial }}>Cinders</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 22 }}>
                  {SYS_WARN.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: `${w.color}14`, border: `1px solid ${w.color}2e`, borderRadius: 6, padding: "10px 14px" }}>
                      <span style={{ color: w.color, fontSize: 14, flexShrink: 0 }}>{w.icon}</span>
                      <span style={{ fontFamily: F.body, fontSize: 12.5, color: w.color === C.glacial ? C.mid : w.color, lineHeight: 1.5 }}>{w.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cost wall */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ position: "relative", background: "linear-gradient(135deg, rgba(20,30,48,0.9), rgba(196,77,82,0.06))", border: "1px solid rgba(196,77,82,0.2)", borderRadius: 12, padding: "36px 32px", textAlign: "center", overflow: "hidden" }}>
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: C.redFrost, marginBottom: 12 }}>Before You Commit</div>
                <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 14, color: C.slate, marginBottom: 8 }}>Full Trait-Out Cost</div>
                <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: 50, color: C.redFrost, animation: "redGlow 4s ease-in-out infinite", lineHeight: 1.1 }}>2.1 BILLION</div>
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 16, color: C.redSoft, letterSpacing: 2, marginTop: 4 }}>SOLVENT</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(107,163,190,0.08)" }}>
                  <div><div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 600, color: C.snow }}>10,000</div><div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>Ores</div></div>
                  <div style={{ width: 1, background: "rgba(107,163,190,0.1)" }} />
                  <div><div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 600, color: C.snow }}>30,000</div><div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>Powder</div></div>
                  <div style={{ width: 1, background: "rgba(107,163,190,0.1)" }} />
                  <div><div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 600, color: C.flame }}>2B+</div><div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>Skills (solvent)</div></div>
                </div>
                <div style={{ marginTop: 18, fontFamily: F.display, fontWeight: 500, fontSize: 13, color: C.mid }}>Pick your path wisely — switching builds costs a fortune.</div>
              </div>
            </div>

            {/* System changes */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.glacial }} />
              <span style={sectionTitle}>What Changed</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {SYS_CHANGES.map((s, i) => (
                <div key={i} style={{ ...card, padding: "16px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 14, color: C.glacial, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.mid, lineHeight: 1.55 }}>{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FARM & SECRETS ── */}
        {tab === "secrets" && (
          <div style={{ padding: "0 24px 60px" }}>
            {/* Featured candle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.flame }} />
              <span style={sectionTitle}>Farm & Secrets</span>
            </div>
            <div style={{ background: "linear-gradient(135deg, rgba(212,160,74,0.08), rgba(20,30,48,0.9))", border: "1px solid rgba(212,160,74,0.25)", borderRadius: 10, padding: "24px 20px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 44, height: 44, background: "rgba(212,160,74,0.12)", border: "1px solid rgba(212,160,74,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "float 4s ease-in-out infinite" }}><span style={{ fontSize: 20 }}>★</span></div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 15, color: C.flame }}>The Candle That Melts Eternity</div>
                    <SourceBadge source="community" />
                  </div>
                  <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 11, color: C.slate, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Best Solo Purple Farm</div>
                  <div style={{ fontFamily: F.body, fontSize: 13, color: C.mid, lineHeight: 1.6 }}>Roll a Nix scroll until you get the "Scar of Sacrifice" task, then run this solo tower-defense Field Event. Reported to drop <span style={{ color: C.redSoft, fontWeight: 500 }}>~3 purple Red Frost packs</span> roughly every 30 minutes — normally a 6-player instance. The event itself is confirmed by the devs; the exact yield is a community finding.</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                    {[["~30 min loop", C.flame], ["~3 purple packs", C.redSoft], ["Solo · no party", C.glacial]].map(([t, c], i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 6, height: 6, background: c, borderRadius: "50%" }} /><span style={{ fontFamily: F.mono, fontSize: 11, color: c }}>{t}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
              {SECRETS.map((s, i) => (
                <div key={i} style={{ ...card, padding: "16px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 13, color: C.glacial }}>{s.title}</div>
                    <SourceBadge source={s.source} />
                  </div>
                  <div style={{ fontFamily: F.body, fontSize: 12, color: C.mid, lineHeight: 1.5, marginBottom: 10 }}>{s.body}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.flame }}>{s.stat}</div>
                </div>
              ))}
            </div>

            {/* BiS */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ ...bar, background: C.glacial }} />
              <span style={sectionTitle}>BiS Predictions</span>
              <SourceBadge source="community" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {BIS.map((b, i) => (
                <div key={i} style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 13, color: C.glacial, marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.mid, lineHeight: 1.5 }}>{b.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── WHAT'S NEXT ── */}
        {tab === "next" && (
          <div style={{ padding: "0 24px 60px" }}>
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{ ...bar, background: C.glacial }} />
                <span style={sectionTitle}>What's Ahead</span>
              </div>
              <div style={{ position: "relative", paddingLeft: 36 }}>
                <div style={{ position: "absolute", left: 15, top: 8, bottom: 8, width: 2, background: "linear-gradient(180deg, #6BA3BE 0%, rgba(107,163,190,0.3) 60%, rgba(107,163,190,0.1) 100%)" }} />
                {ROADMAP.map((r, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: i === ROADMAP.length - 1 ? 0 : 30 }}>
                    <div style={{ position: "absolute", left: -29, top: 4, width: 16, height: 16, background: r.now ? C.glacial : C.permafrost, border: r.now ? "3px solid #0B1120" : `2px solid rgba(107,163,190,${r.op})`, borderRadius: "50%", animation: r.now ? "timelinePulse 2s ease-in-out infinite" : "none", zIndex: 1 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 15, color: r.now ? C.glacial : C.mid, letterSpacing: 1 }}>{r.when}</span>
                      {r.now && <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, letterSpacing: 1, padding: "2px 8px", background: "rgba(107,163,190,0.15)", color: C.glacial, borderRadius: 3, border: "1px solid rgba(107,163,190,0.3)" }}>NOW</span>}
                    </div>
                    <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 14, color: r.now ? C.snow : "#8a9bb0", marginBottom: 4 }}>{r.title}</div>
                    <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>{r.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(107,163,190,0.1)", paddingTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ ...bar, background: C.slate }} />
                <span style={sectionTitle}>Quick Reference</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8, padding: "16px 14px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, color: C.glacial, marginBottom: 10, letterSpacing: 1 }}>COUPON CODE</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 12, color: C.snow, background: "rgba(107,163,190,0.08)", padding: "3px 8px", borderRadius: 4, letterSpacing: 1 }}>NIXREVEAL2026</span>
                    <span style={{ fontSize: 11, color: C.slate }}>Exp. Jul 31</span>
                  </div>
                  <div style={{ fontFamily: F.body, fontSize: 11, color: C.slate, lineHeight: 1.45 }}>Confirm any launch-day code from the official reveal video / site. Main Menu → Coupon.</div>
                </div>
                <div style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8, padding: "16px 14px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, color: C.glacial, marginBottom: 10, letterSpacing: 1 }}>DA VINCI'S FAVOR</div>
                  {[["Contracts", "5/day not 10"], ["Dungeon chests", "Halved"], ["Red Frost slots", "+ safety"], ["Mastery", "Assignable"]].map(([k, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 12, color: C.mid }}>{k}</span><span style={{ fontFamily: F.mono, fontSize: 12, color: C.flame }}>{v}</span></div>
                  ))}
                </div>
                <div style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8, padding: "16px 14px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, color: C.glacial, marginBottom: 10, letterSpacing: 1 }}>NAVIGATION</div>
                  <div style={{ fontFamily: F.body, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>No traditional waypoints — use the Auroral Path / Star Beacon system. Five teleport stones (one per hunting ground) auto-unlock on entry; using them costs a fee.</div>
                </div>
                <div style={{ background: "rgba(20,30,48,0.6)", border: "1px solid rgba(107,163,190,0.1)", borderRadius: 8, padding: "16px 14px" }}>
                  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 12, color: C.glacial, marginBottom: 10, letterSpacing: 1 }}>KEY NUMBERS</div>
                  {[["Level cap", "60"], ["Stat cap", "130 (was 99)"], ["Weekly Flames", "8,000"], ["Field events", "25 + 5 irregular"]].map(([k, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 12, color: C.mid }}>{k}</span><span style={{ fontFamily: F.mono, fontSize: 12, color: C.glacial }}>{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "16px 0 28px" }}>
          <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.faint }}>TL Helper · Nix Field Guide · Patch 4.0</div>
        </div>
      </div>
    </div>
  );
}
