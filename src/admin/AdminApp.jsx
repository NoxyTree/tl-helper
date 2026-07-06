import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { LIVE_SECTIONS } from "../liveContent.js";
import * as staticContent from "../content.js";

/* Static deadlines carry Date.UTC(...) numbers; DB payloads store ISO strings
   so they survive JSON. Convert when seeding. */
function toSeedPayload(section, item) {
  if (section === "deadlines" && typeof item.target === "number") {
    return { ...item, target: new Date(item.target).toISOString() };
  }
  return item;
}

function FieldEditor({ name, value, onChange }) {
  if (typeof value === "boolean") {
    return (
      <label className="adm-field adm-field--check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{name}</span>
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <label className="adm-field">
        <span>{name}</span>
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    );
  }
  if (typeof value === "string") {
    const long = value.length > 60;
    return (
      <label className="adm-field">
        <span>{name}</span>
        {long
          ? <textarea rows={Math.min(6, Math.ceil(value.length / 70))} value={value} onChange={(e) => onChange(e.target.value)} />
          : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />}
      </label>
    );
  }
  return <JsonField name={name} value={value} onChange={onChange} />;
}

function JsonField({ name, value, onChange }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <label className={`adm-field adm-field--json${bad ? " adm-field--bad" : ""}`}>
      <span>{name} (JSON)</span>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </label>
  );
}

function EntryCard({ entry, onSave, onSetStatus, onDelete, busy }) {
  const [open, setOpen] = useState(entry.status === "pending");
  const [payload, setPayload] = useState(entry.payload);
  const [sortOrder, setSortOrder] = useState(entry.sort_order);
  const dirty = useMemo(
    () => JSON.stringify(payload) !== JSON.stringify(entry.payload) || sortOrder !== entry.sort_order,
    [payload, sortOrder, entry],
  );

  const title = payload.title || payload.label || payload.when || "(untitled)";
  const setField = (key) => (val) => setPayload((p) => ({ ...p, [key]: val }));

  return (
    <article className={`adm-card adm-card--${entry.status}`}>
      <header className="adm-card__head" onClick={() => setOpen(!open)} role="button">
        <span className="adm-badge">{entry.section}</span>
        <strong>{title}</strong>
        {entry.origin && <em className="adm-origin" title={entry.origin}>via {entry.origin}</em>}
        <span className={`adm-status adm-status--${entry.status}`}>{open ? "▾" : "▸"} {entry.status}</span>
      </header>
      {open && (
        <>
          <div className="adm-card__fields">
            {Object.entries(payload).map(([key, value]) => (
              <FieldEditor key={key} name={key} value={value} onChange={setField(key)} />
            ))}
            <label className="adm-field adm-field--sort">
              <span>sort_order</span>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </label>
          </div>
          <footer className="adm-card__actions">
            {dirty && (
              <button disabled={busy} className="adm-btn adm-btn--save" onClick={() => onSave(entry.id, payload, sortOrder)}>
                Save edits
              </button>
            )}
            {entry.status === "pending" && (
              <>
                <button disabled={busy} className="adm-btn adm-btn--ok" onClick={() => onSetStatus(entry.id, "approved", dirty ? { payload, sortOrder } : null)}>
                  Approve{dirty ? " with edits" : ""}
                </button>
                <button disabled={busy} className="adm-btn adm-btn--no" onClick={() => onSetStatus(entry.id, "rejected")}>Reject</button>
              </>
            )}
            {entry.status === "approved" && (
              <button disabled={busy} className="adm-btn" onClick={() => onSetStatus(entry.id, "archived")}>Take off site</button>
            )}
            {(entry.status === "rejected" || entry.status === "archived") && (
              <>
                <button disabled={busy} className="adm-btn" onClick={() => onSetStatus(entry.id, "approved")}>Put back live</button>
                <button disabled={busy} className="adm-btn adm-btn--no" onClick={() => onDelete(entry.id)}>Delete forever</button>
              </>
            )}
          </footer>
        </>
      )}
    </article>
  );
}

const KIND_LABEL = {
  patchnote_global: { label: "Official patch notes", tone: "ok" },
  patchnote_kr: { label: "KR notes (may change)", tone: "gold" },
  video: { label: "Creator video", tone: "frost" },
};

function SourcesTab() {
  const [sources, setSources] = useState(null);
  useEffect(() => {
    supabase.from("research_sources").select("*")
      .order("fetched", { ascending: false }).order("title").limit(200)
      .then(({ data }) => setSources(data || []));
  }, []);
  if (sources === null) return <p className="adm-note">Loading…</p>;
  if (!sources.length) {
    return <p className="adm-note">Nothing gathered yet — sources appear here after the first refresh job runs.</p>;
  }
  return (
    <div className="adm-sources">
      {sources.map((s) => (
        <a key={s.id} className="adm-source" href={s.url} target="_blank" rel="noreferrer">
          <span className={`adm-pill adm-pill--${KIND_LABEL[s.kind]?.tone || "frost"}`}>{KIND_LABEL[s.kind]?.label || s.kind}</span>
          <strong>{s.title}</strong>
          <em>{s.channel ? `${s.channel} · ` : ""}{s.fetched}{s.words ? ` · ${s.words.toLocaleString()}w` : ""}</em>
        </a>
      ))}
    </div>
  );
}

function runSummary(run) {
  if (run.status === "nothing_new") return "Nothing new found";
  const s = run.stats || {};
  const bits = [];
  if (s.new_notes != null) bits.push(`${s.new_notes} patch notes`);
  if (s.new_videos != null) bits.push(`${s.new_videos} videos`);
  if (s.drafts != null) bits.push(`${s.drafts} drafts queued`);
  return bits.join(" · ") || "—";
}

function JobsTab({ busy, act }) {
  const [runs, setRuns] = useState(null);

  const load = useCallback(() => {
    supabase.from("pipeline_runs").select("*")
      .order("requested_at", { ascending: false }).limit(25)
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Poll while something is queued or running so the row updates itself.
  const active = runs?.some((r) => r.status === "requested" || r.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [active, load]);

  const requestRun = () => act(async () => {
    const { error } = await supabase.from("pipeline_runs").insert({ status: "requested", engine: "ollama" });
    if (error) throw error;
    load();
  }, "Run requested — your PC picks it up within a minute.");

  return (
    <div>
      <div className="adm-jobrow">
        <button className="adm-btn adm-btn--ok" disabled={busy || active} onClick={requestRun}>
          {active ? "Run in progress…" : "Run refresh"}
        </button>
        <span className="adm-note">Gathers new patch notes + videos, drafts entries into Review. Needs your PC on.</span>
      </div>
      {runs === null ? <p className="adm-note">Loading…</p> : !runs.length ? (
        <p className="adm-note">No runs yet.</p>
      ) : (
        <div className="adm-runs">
          {runs.map((r) => (
            <details key={r.id} className={`adm-run adm-run--${r.status}`}>
              <summary>
                <span className={`adm-pill adm-pill--${{ done: "ok", nothing_new: "frost", failed: "no", running: "gold", requested: "gold" }[r.status]}`}>
                  {r.status.replace("_", " ")}
                </span>
                <strong>{runSummary(r)}</strong>
                <em>{new Date(r.requested_at).toLocaleString()} · {r.engine}</em>
              </summary>
              {r.log && <pre className="adm-log">{r.log}</pre>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [tab, setTab] = useState("review");
  const [entries, setEntries] = useState([]);
  const [liveSection, setLiveSection] = useState(LIVE_SECTIONS[0]);
  const [liveStatus, setLiveStatus] = useState("approved");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("guide_entries")
      .select("*")
      .order("section")
      .order("sort_order")
      .order("created_at");
    if (error) setNotice(`Load failed: ${error.message}`);
    else setEntries(data || []);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data?.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setIsAdmin(session ? null : false); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
      setIsAdmin(Boolean(data?.is_admin));
    })();
  }, [session]);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  const act = async (fn, doneMsg) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await refresh();
      if (doneMsg) setNotice(doneMsg);
    } catch (err) {
      setNotice(`Failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = (id, payload, sortOrder) => act(async () => {
    const { error } = await supabase.from("guide_entries")
      .update({ payload, sort_order: sortOrder }).eq("id", id);
    if (error) throw error;
  }, "Saved.");

  const setStatus = (id, status, edits) => act(async () => {
    const patch = { status };
    if (edits) { patch.payload = edits.payload; patch.sort_order = edits.sortOrder; }
    const { error } = await supabase.from("guide_entries").update(patch).eq("id", id);
    if (error) throw error;
  }, `Marked ${status}.`);

  const deleteEntry = (id) => act(async () => {
    const { error } = await supabase.from("guide_entries").delete().eq("id", id);
    if (error) throw error;
  }, "Deleted.");

  const seedAll = (sections) => act(async () => {
    const rows = sections.flatMap((section) =>
      (staticContent[section] || []).map((item, i) => ({
        section,
        payload: toSeedPayload(section, item),
        status: "approved",
        sort_order: i * 10,
        origin: "seed:content.js",
      })));
    const { error } = await supabase.from("guide_entries").insert(rows);
    if (error) throw error;
  }, "All sections imported — everything on the site is editable here now.");

  if (!supabase) {
    return <main className="adm-shell"><p className="adm-note">Supabase isn't configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</p></main>;
  }

  if (!session) {
    return (
      <main className="adm-shell adm-shell--center">
        <h1>TL Helper · Admin</h1>
        <div className="adm-auth">
          <button className="adm-btn adm-btn--ok" onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } })}>Sign in with Google</button>
          <button className="adm-btn adm-btn--ok" onClick={() => supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.href } })}>Sign in with Discord</button>
        </div>
      </main>
    );
  }

  if (isAdmin === false) {
    return (
      <main className="adm-shell adm-shell--center">
        <h1>Not authorized</h1>
        <button className="adm-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </main>
    );
  }

  if (isAdmin === null) {
    return <main className="adm-shell adm-shell--center"><p className="adm-note">Checking access…</p></main>;
  }

  const pending = entries.filter((e) => e.status === "pending");
  const seededSections = new Set(entries.map((e) => e.section));
  const unseeded = LIVE_SECTIONS.filter((s) => !seededSections.has(s) && (staticContent[s] || []).length);
  const liveEntries = entries.filter((e) => e.section === liveSection && e.status === liveStatus);

  return (
    <main className="adm-shell">
      <header className="adm-top">
        <h1>TL Helper · Admin</h1>
        <div className="adm-top__right">
          <a className="adm-note" href="/" target="_blank" rel="noreferrer">view site ↗</a>
          <button className="adm-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <nav className="adm-filters">
        {[
          ["review", `Review${pending.length ? ` (${pending.length})` : ""}`],
          ["sources", "Sources"],
          ["jobs", "Jobs"],
        ].map(([id, label]) => (
          <button key={id} className={`adm-tab${tab === id ? " adm-tab--on" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {notice && <p className="adm-notice">{notice}</p>}

      {tab === "review" && (
        <>
          <section className="adm-block">
            <h2>Waiting for review</h2>
            {pending.length === 0 && <p className="adm-note">Nothing pending. Run a refresh from the Jobs tab to gather new drafts.</p>}
            <div className="adm-list">
              {pending.map((entry) => (
                <EntryCard key={entry.id} entry={entry} busy={busy} onSave={saveEntry} onSetStatus={setStatus} onDelete={deleteEntry} />
              ))}
            </div>
          </section>

          <section className="adm-block">
            <h2>Edit the site</h2>
            {unseeded.length > 0 && (
              <p className="adm-note">
                {unseeded.length} section(s) still come from the built-in content.{" "}
                <button className="adm-btn" disabled={busy} onClick={() => seedAll(unseeded)}>Import everything for editing</button>
              </p>
            )}
            <div className="adm-jobrow">
              <select value={liveSection} onChange={(e) => setLiveSection(e.target.value)}>
                {LIVE_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={liveStatus} onChange={(e) => setLiveStatus(e.target.value)}>
                <option value="approved">live on site</option>
                <option value="rejected">rejected</option>
                <option value="archived">taken off site</option>
              </select>
            </div>
            {seededSections.has(liveSection) ? (
              <div className="adm-list">
                {liveEntries.length === 0 && <p className="adm-note">Nothing here.</p>}
                {liveEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} busy={busy} onSave={saveEntry} onSetStatus={setStatus} onDelete={deleteEntry} />
                ))}
              </div>
            ) : (
              <p className="adm-note">This section still renders from the built-in content — import above to edit it.</p>
            )}
          </section>
        </>
      )}

      {tab === "sources" && <SourcesTab />}
      {tab === "jobs" && <JobsTab busy={busy} act={act} />}
    </main>
  );
}
