import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { LIVE_SECTIONS } from "../liveContent.js";
import * as staticContent from "../content.js";

const STATUSES = ["pending", "approved", "rejected", "archived"];

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
  // Objects/arrays (e.g. the image attachment) fall back to raw JSON.
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
      <header className="adm-card__head">
        <span className="adm-badge">{entry.section}</span>
        <strong>{title}</strong>
        {entry.origin && <em className="adm-origin" title={entry.origin}>via {entry.origin}</em>}
        <span className={`adm-status adm-status--${entry.status}`}>{entry.status}</span>
      </header>
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
          <button disabled={busy} className="adm-btn" onClick={() => onSetStatus(entry.id, "archived")}>Archive</button>
        )}
        {(entry.status === "rejected" || entry.status === "archived") && (
          <>
            <button disabled={busy} className="adm-btn" onClick={() => onSetStatus(entry.id, "pending")}>Back to pending</button>
            <button disabled={busy} className="adm-btn adm-btn--no" onClick={() => onDelete(entry.id)}>Delete forever</button>
          </>
        )}
      </footer>
    </article>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null); // null = unknown yet
  const [entries, setEntries] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sectionFilter, setSectionFilter] = useState("all");
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

  /* Import a section's static content.js entries as approved rows — from then
     on that section renders (and is edited) entirely from the database. */
  const seedSection = (section) => act(async () => {
    const items = staticContent[section] || [];
    const rows = items.map((item, i) => ({
      section,
      payload: toSeedPayload(section, item),
      status: "approved",
      sort_order: i * 10,
      origin: "seed:content.js",
    }));
    const { error } = await supabase.from("guide_entries").insert(rows);
    if (error) throw error;
  }, `Seeded ${section} from static content.`);

  if (!supabase) {
    return <main className="adm-shell"><p className="adm-note">Supabase isn't configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). The admin page needs it.</p></main>;
  }

  if (!session) {
    return (
      <main className="adm-shell adm-shell--center">
        <h1>TL Helper · Content Admin</h1>
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
        <p className="adm-note">This account isn't flagged as an admin.</p>
        <button className="adm-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </main>
    );
  }

  if (isAdmin === null) {
    return <main className="adm-shell adm-shell--center"><p className="adm-note">Checking access…</p></main>;
  }

  const seededSections = new Set(entries.map((e) => e.section));
  const unseeded = LIVE_SECTIONS.filter((s) => !seededSections.has(s) && (staticContent[s] || []).length);
  const visible = entries.filter((e) =>
    e.status === statusFilter && (sectionFilter === "all" || e.section === sectionFilter));
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  return (
    <main className="adm-shell">
      <header className="adm-top">
        <h1>TL Helper · Content Admin</h1>
        <div className="adm-top__right">
          <span className="adm-note">{session.user.email}</span>
          <button className="adm-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {notice && <p className="adm-notice">{notice}</p>}

      <nav className="adm-filters">
        {STATUSES.map((s) => (
          <button key={s} className={`adm-tab${statusFilter === s ? " adm-tab--on" : ""}`} onClick={() => setStatusFilter(s)}>
            {s}{s === "pending" && pendingCount ? ` (${pendingCount})` : ""}
          </button>
        ))}
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
          <option value="all">all sections</option>
          {LIVE_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="adm-btn" disabled={busy} onClick={refresh}>Refresh</button>
      </nav>

      {unseeded.length > 0 && (
        <section className="adm-seed">
          <p className="adm-note">Sections still rendering from static content.js — seed one to manage it here:</p>
          <div className="adm-seed__btns">
            {unseeded.map((s) => (
              <button key={s} className="adm-btn" disabled={busy} onClick={() => seedSection(s)}>Seed {s}</button>
            ))}
          </div>
        </section>
      )}

      <section className="adm-list">
        {visible.length === 0 && <p className="adm-note">Nothing {statusFilter}{sectionFilter !== "all" ? ` in ${sectionFilter}` : ""}.</p>}
        {visible.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            busy={busy}
            onSave={saveEntry}
            onSetStatus={setStatus}
            onDelete={deleteEntry}
          />
        ))}
      </section>
    </main>
  );
}
