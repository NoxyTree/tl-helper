import { useEffect, useMemo, useState } from "react";
import {
  ASSETS,
  builds,
  dailyLoop,
  deadlines,
  farmSpots,
  featureCards,
  intel,
  navItems,
  priorities,
  roadmap,
  sourceLegend,
  systems,
  targets,
  warnings,
  weeklyLoop,
} from "./content";

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const diff = target - now;
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0 };
  }

  return {
    expired: false,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

/* Clickable screenshot thumbnail that opens the lightbox. `image` is the
   { src, credit, caption, fit } object attached to a content entry. */
function CardShot({ image, onZoom }) {
  if (!image) return null;
  return (
    <figure className="card-shot">
      <button type="button" className={cx("card-shot__btn", image.fit === "contain" && "card-shot__btn--contain")} onClick={() => onZoom(image)} aria-label={`Enlarge screenshot: ${image.caption || "community screenshot"}`}>
        <img src={image.src} alt={image.caption || ""} loading="lazy" />
      </button>
      <figcaption>
        <span>{image.caption}</span>
        <em>via {image.credit}</em>
      </figcaption>
    </figure>
  );
}

function Lightbox({ shot, onClose }) {
  useEffect(() => {
    if (!shot) return;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shot, onClose]);

  if (!shot) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close">×</button>
      <img className="lightbox__img" src={shot.src} alt={shot.caption || ""} onClick={(event) => event.stopPropagation()} />
      <div className="lightbox__cap">
        <p>{shot.caption}</p>
        <span>via {shot.credit} · Discord community</span>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src="/assets/brand/logo.png" alt="" />
    </div>
  );
}

function Badge({ children, tone = "frost" }) {
  return <span className={cx("badge", `badge--${tone}`)}>{children}</span>;
}

function SourceBadge({ source, confidence }) {
  const tone = source === "official" ? "frost" : confidence === "unconfirmed" ? "danger" : "void";
  return (
    <span className={cx("source-badge", `source-badge--${tone}`)}>
      <span>{source === "official" ? "Official" : "Community"}</span>
      {confidence && <em>{confidence}</em>}
    </span>
  );
}

function SectionHeader({ eyebrow, title, body, id }) {
  return (
    <div id={id} className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
      </div>
    </div>
  );
}

function DeadlineCard({ item }) {
  const countdown = useCountdown(item.target);
  const urgent = !countdown.expired && countdown.days < 7;

  return (
    <article className={cx("deadline-card", `deadline-card--${item.tone}`, urgent && "deadline-card--urgent")}>
      <div className="deadline-card__top">
        <div>
          <Badge tone={item.tone}>{item.action}</Badge>
          <h3>{item.title}</h3>
        </div>
        <SourceBadge source={item.source} confidence={item.confidence} />
      </div>

      <div className="countdown" aria-label={countdown.expired ? "Closed" : "Countdown remaining"}>
        {countdown.expired ? (
          <strong>Closed</strong>
        ) : (
          [
            [countdown.days, "d"],
            [countdown.hours, "h"],
            [countdown.minutes, "m"],
          ].map(([value, unit]) => (
            <span key={unit}>
              <strong>{String(value).padStart(2, "0")}</strong>
              <small>{unit}</small>
            </span>
          ))
        )}
      </div>
      <p>{item.body}</p>
    </article>
  );
}

function PriorityCard({ item, index }) {
  return (
    <article className="priority-card">
      <div className="priority-card__number">{String(index + 1).padStart(2, "0")}</div>
      <div className="priority-card__content">
        <div className="priority-card__meta">
          <Badge tone={item.source === "official" ? "frost" : "void"}>{item.tag}</Badge>
          <SourceBadge source={item.source} confidence={item.confidence} />
        </div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </div>
    </article>
  );
}

function StatCard({ item }) {
  return (
    <article className="stat-card">
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <p>{item.note}</p>
    </article>
  );
}

function LoopItem({ item, onZoom }) {
  return (
    <article className={cx("loop-item", item.priority && "loop-item--priority")}>
      <div className="loop-item__num">{item.n || "◆"}</div>
      <div>
        <div className="loop-item__head">
          <h3>{item.title}</h3>
          <Badge tone={item.priority ? "gold" : "frost"}>{item.reward}</Badge>
        </div>
        <p>{item.body}</p>
        <CardShot image={item.image} onZoom={onZoom} />
      </div>
    </article>
  );
}

function WarningCard({ item, onZoom }) {
  return (
    <article className={cx("warning-card", `warning-card--${item.tone}`)}>
      <div className="warning-card__icon">!</div>
      <div>
        <div className="warning-card__head">
          <h3>{item.title}</h3>
          <SourceBadge source={item.source} confidence={item.confidence} />
        </div>
        <p>{item.body}</p>
        <CardShot image={item.image} onZoom={onZoom} />
      </div>
    </article>
  );
}

function SystemCard({ item, onZoom }) {
  return (
    <article className="system-card">
      <div className="system-card__head">
        <h3>{item.title}</h3>
        <SourceBadge source={item.source} confidence={item.confidence} />
      </div>
      <p>{item.body}</p>
      <CardShot image={item.image} onZoom={onZoom} />
    </article>
  );
}

function IntelCard({ item }) {
  return (
    <article className="intel-card">
      <div className="intel-card__meta">
        <Badge tone={item.source === "official" ? "frost" : item.confidence === "unconfirmed" ? "danger" : "void"}>{item.stat}</Badge>
        <SourceBadge source={item.source} confidence={item.confidence} />
      </div>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </article>
  );
}

function FeatureCard({ item }) {
  return (
    <article className="feature-card">
      <img src={item.image} alt="" />
      <div className="feature-card__scrim" />
      <div className="feature-card__content">
        <span>{item.kicker}</span>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </div>
    </article>
  );
}

function BuildCard({ item, onZoom }) {
  return (
    <article className="build-card">
      <h3>{item.label}</h3>
      <p>{item.body}</p>
      <CardShot image={item.image} onZoom={onZoom} />
    </article>
  );
}

function RoadmapItem({ item }) {
  return (
    <article className={cx("roadmap-item", `roadmap-item--${item.status}`)}>
      <div className="roadmap-item__dot" />
      <span>{item.when}</span>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </article>
  );
}

function SearchResults({ results, query, onClear }) {
  if (!query.trim()) return null;

  return (
    <section className="search-results" aria-live="polite">
      <div className="search-results__header">
        <div>
          <p className="eyebrow">Search Results</p>
          <h2>{results.length ? `${results.length} match${results.length === 1 ? "" : "es"} for “${query}”` : `No matches for “${query}”`}</h2>
        </div>
        <button type="button" onClick={onClear}>Clear search</button>
      </div>
      {results.length ? (
        <div className="search-results__grid">
          {results.map((result) => (
            <article key={`${result.group}-${result.title}`} className="search-result-card">
              <Badge tone={result.tone}>{result.group}</Badge>
              <h3>{result.title}</h3>
              <p>{result.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="search-results__empty">Try searching for “flames”, “purify”, “contracts”, “trait”, “archboss” or “merchant”.</p>
      )}
    </section>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("briefing");
  const [zoom, setZoom] = useState(null);  // active screenshot for the lightbox

  const nextDeadline = [...deadlines]
    .filter((item) => item.target > Date.now())
    .sort((a, b) => a.target - b.target)[0];
  const nearest = useCountdown(nextDeadline?.target ?? 0);

  const searchIndex = useMemo(() => {
    const pack = (items, group, tone = "frost") => items.map((item) => ({
      group,
      tone,
      title: item.title || item.label,
      body: item.body || item.note || "",
    }));

    return [
      ...pack(priorities, "Priority", "gold"),
      ...pack(deadlines, "Deadline", "danger"),
      ...pack(dailyLoop, "Daily Loop", "frost"),
      ...pack(weeklyLoop, "Weekly Loop", "frost"),
      ...pack(warnings, "Warning", "danger"),
      ...pack(systems, "System", "frost"),
      ...pack(intel, "Community Intel", "void"),
      ...pack(builds, "Build Notes", "gold"),
      ...pack(roadmap, "Roadmap", "frost"),
    ];
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex.filter((item) => `${item.group} ${item.title} ${item.body}`.toLowerCase().includes(q)).slice(0, 12);
  }, [query, searchIndex]);

  useEffect(() => {
    const sections = navItems.map((item) => document.getElementById(item.id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveSection(visible.target.id);
    }, { rootMargin: "-18% 0px -66% 0px", threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const jumpTo = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="site-shell">
      <div className="ambient ambient--frost" />
      <div className="ambient ambient--gold" />
      <div className="ambient ambient--void" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="TL Helper home">
          <BrandMark />
          <span>
            <strong>TL HELPER</strong>
            <em>Community intelligence</em>
          </span>
        </a>

        <nav className="topbar__nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeSection === item.id ? "is-active" : ""}
              aria-current={activeSection === item.id ? "location" : undefined}
              onClick={() => jumpTo(item.id)}
            >
              {item.label}
            </button>
          ))}
          <a className="topbar__link" href="/achievements/">Achievement Tracker</a>
        </nav>

        <div className="topbar__status">
          <span className="status-dot" />
          <span>Patch 4.0 · Verified Jun 30</span>
        </div>
      </header>

      <main id="top">
        <section className="hero" style={{ "--hero-image": `url(${ASSETS.hero})` }}>
          <div className="hero__image" />
          <div className="hero__content">
            <div className="hero__copy">
              <Badge tone="gold">Throne and Liberty · Nix Field Guide</Badge>
              <h1>Find the public TL info that actually matters.</h1>
              <p>
                A dark fantasy command board for community guides, official notes, hotfix changes,
                farming routes, event deadlines and player-tested intel — all made easy to scan.
              </p>

              <div className="searchbox" role="search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" /></svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search guides, systems, farming spots, traits..."
                  aria-label="Search TL Helper"
                />
              </div>

              <div className="hero__actions">
                <button type="button" onClick={() => jumpTo("briefing")}>Start with the briefing</button>
                <a className="hero__action-link" href="/achievements/">Open achievement tracker</a>
                <button type="button" className="ghost" onClick={() => jumpTo("intel")}>View community intel</button>
              </div>
            </div>

            <aside className="briefing-panel" aria-label="Live briefing">
              <div className="briefing-panel__header">
                <div>
                  <p className="eyebrow">Live Board</p>
                  <h2>Next deadline</h2>
                  <p className="briefing-panel__next">{nextDeadline?.title || "No active deadlines"}</p>
                </div>
                <Badge tone={nearest.expired ? "frost" : nearest.days < 7 ? "danger" : "gold"}>{nearest.expired ? "Closed" : `${nearest.days}d left`}</Badge>
              </div>

              <div className="briefing-panel__timer">
                {nearest.expired ? (
                  <strong>—</strong>
                ) : (
                  [
                    [nearest.days, "days"],
                    [nearest.hours, "hours"],
                    [nearest.minutes, "mins"],
                  ].map(([value, unit]) => (
                    <span key={unit}>
                      <strong>{String(value).padStart(2, "0")}</strong>
                      <small>{unit}</small>
                    </span>
                  ))
                )}
              </div>

              <div className="briefing-panel__list">
                {deadlines.map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <em>{item.action}</em>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <SearchResults results={results} query={query} onClear={() => setQuery("")} />

        <section className="feature-grid" aria-label="TL Helper pillars">
          {featureCards.map((item) => <FeatureCard key={item.title} item={item} />)}
        </section>

        <div className="content-layout">
          <aside className="side-rail">
            <div className="side-rail__card side-rail__card--sticky">
              <p className="eyebrow">Intel Stack</p>
              <h2>Designed for trust</h2>
              <p>TL Helper separates official information from community testing, unconfirmed leads and hotfix-sensitive advice.</p>
              <div className="source-legend">
                {sourceLegend.map((item) => (
                  <div key={item.label}>
                    <Badge tone={item.tone}>{item.label}</Badge>
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="main-stack">
            <section className="panel-section">
              <SectionHeader
                id="briefing"
                eyebrow="Command Briefing"
                title="What matters right now"
                body="Start the 49-day attendance track, protect your Redfrost drops, and avoid spending into systems that are about to receive cheaper acquisition paths."
              />

              <div className="deadline-grid">
                {deadlines.map((item) => <DeadlineCard key={item.id} item={item} />)}
              </div>

              <div className="priority-grid">
                {priorities.map((item, index) => <PriorityCard key={item.title} item={item} index={index} />)}
              </div>
            </section>

            <section className="panel-section">
              <SectionHeader
                id="loop"
                eyebrow="Loop Planner"
                title="Daily and weekly structure"
                body="The efficient route is merchant purchases first, timed entries and scrolls second, then contracts and token burn with every mastery buff active."
              />

              <div className="stat-grid">
                {targets.map((item) => <StatCard key={item.label} item={item} />)}
              </div>

              <div className="two-column">
                <div>
                  <div className="subhead">
                    <Badge tone="frost">Daily</Badge>
                    <h3>Log in route</h3>
                  </div>
                  <div className="loop-list">
                    {dailyLoop.map((item) => <LoopItem key={item.title} item={item} onZoom={setZoom} />)}
                  </div>
                </div>

                <div>
                  <div className="subhead">
                    <Badge tone="gold">Weekly</Badge>
                    <h3>Reset priorities</h3>
                  </div>
                  <div className="loop-list">
                    {weeklyLoop.map((item) => <LoopItem key={item.title} item={item} />)}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel-section">
              <SectionHeader
                id="systems"
                eyebrow="System Changes"
                title="The expensive mistakes to avoid"
                body="Item Level replaced Enhancement, Inheritance replaced Sync, and traits, sealing and skill growth now consume enough materials to punish casual build switching."
              />

              <div className="warning-grid">
                {warnings.map((item) => <WarningCard key={item.title} item={item} onZoom={setZoom} />)}
              </div>

              <div className="process-card">
                <div>
                  <p className="eyebrow">Purification Flow</p>
                  <h3>Farm → safe-slot → purify → craft</h3>
                  <p>Redfrost disappears on death, logout or leaving Nix. The safe slot protects against death and movement only; purify before logging out or exiting the region.</p>
                </div>
                <div className="process-flow" aria-label="Purification process">
                  {[
                    ["Farm", "Red Frost"],
                    ["Secure", "Safety Bag"],
                    ["Purify", "Purple gear"],
                    ["Craft", "Nix gear"],
                  ].map(([title, subtitle], index) => (
                    <div className="process-step" key={title}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{title}</strong>
                      <small>{subtitle}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="system-grid">
                {systems.map((item) => <SystemCard key={item.title} item={item} onZoom={setZoom} />)}
              </div>
            </section>

            <section className="panel-section">
              <SectionHeader
                id="intel"
                eyebrow="Community Intel"
                title="Useful findings, clearly labelled"
                body="These routes come from player testing and transcript-backed demonstrations. Exact yields can change after hotfixes, so each claim keeps its confidence label."
              />

              <div className="art-split">
                <img src={ASSETS.void} alt="Arcane purple boss artwork used as visual theme" />
                <div>
                  <Badge tone="void">Best solo scroll roll</Badge>
                  <h3>Scar of Sacrifice: The Candle That Melts Eternity</h3>
                  <p>Refresh a Nix scroll for this task, enter through Shallows of Sacrifice and run the five-minute tower defence solo. The demonstrated reward is three purple Redfrost packs, with the same activity crediting again after 30 minutes.</p>
                </div>
              </div>

              <div className="intel-grid">
                {intel.map((item) => <IntelCard key={item.title} item={item} />)}
              </div>

              <div className="build-grid">
                {builds.map((item) => <BuildCard key={item.label} item={item} onZoom={setZoom} />)}
              </div>

              <div className="farm-gallery-block">
                <div className="subhead">
                  <Badge tone="void">Farm Spots</Badge>
                  <h3>Community-mapped locations</h3>
                </div>
                <p className="farm-gallery-block__note">Shared by hittara for the guide — tap any shot to enlarge.</p>
                <div className="farm-gallery">
                  {farmSpots.map((spot) => (
                    <article key={spot.src} className="farm-card">
                      <button type="button" className="farm-card__img" onClick={() => setZoom({ src: spot.src, caption: `${spot.title} — ${spot.note}`, credit: spot.credit })} aria-label={`Enlarge farm-spot map: ${spot.title}`}>
                        <img src={spot.src} alt={spot.title} loading="lazy" />
                      </button>
                      <div className="farm-card__body">
                        <div className="farm-card__head">
                          <h4>{spot.title}</h4>
                          <em>via {spot.credit}</em>
                        </div>
                        <p>{spot.note}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel-section">
              <SectionHeader
                id="roadmap"
                eyebrow="Roadmap"
                title="Confirmed dates and incoming relief"
                body="The July Resistance Report gives firm dates for dungeon reductions, Character Boost additions, Tumgir Hollow changes, more free Seal Keys and Ramux."
              />

              <div className="roadmap">
                {roadmap.map((item) => <RoadmapItem key={item.title} item={item} />)}
              </div>

              <div className="final-card" style={{ "--final-image": `url(${ASSETS.world})` }}>
                <div>
                  <Badge tone="gold">Cost update in progress</Badge>
                  <h2>The 2.1B figure is not current.</h2>
                  <p>
                    That estimate described the launch-state system before later conversion recipes, increased Heroic
                    material supply and the free traited Heroic attendance rewards. The present full-build total has not
                    been reliably recalculated yet, so this guide will not present the old number as a current cost.
                  </p>
                </div>
              </div>

            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <BrandMark />
        <div>
          <strong>TL Helper</strong>
          <p>Unofficial community resource. Not affiliated with NCSoft, Amazon Games, or Throne and Liberty. Public information should be rechecked after patches and hotfixes. Track completion in the <a href="/achievements/">achievement tracker</a>.</p>
        </div>
      </footer>

      <Lightbox shot={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
