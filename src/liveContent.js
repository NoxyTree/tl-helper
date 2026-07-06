import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import * as staticContent from "./content.js";

/* Sections that can be managed from /admin. When Supabase has at least one
   approved row for a section, that section renders ENTIRELY from the database
   (so archiving/editing works); otherwise the static content.js array stays.
   Seed a section from static via the admin page to take it over. */
export const LIVE_SECTIONS = [
  "deadlines", "priorities", "targets", "warnings",
  "systems", "intel", "roadmap", "builds",
  "dailyLoop", "weeklyLoop", "featureCards", "researchSources",
];

/* DB payloads arrive as plain JSON, so date fields are ISO strings rather
   than the Date.UTC(...) numbers content.js uses. Normalize on the way in. */
function revive(section, payload) {
  if (section === "deadlines" && typeof payload.target === "string") {
    const parsed = Date.parse(payload.target);
    if (!Number.isNaN(parsed)) return { ...payload, target: parsed };
  }
  return payload;
}

export function useLiveContent() {
  const [overrides, setOverrides] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("guide_entries")
        .select("section, payload, sort_order")
        .eq("status", "approved")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled || error || !data?.length) return;
      const bySection = {};
      for (const row of data) {
        (bySection[row.section] ||= []).push(revive(row.section, row.payload));
      }
      setOverrides(bySection);
    })();
    return () => { cancelled = true; };
  }, []);

  const merged = {};
  for (const section of LIVE_SECTIONS) {
    merged[section] = overrides?.[section]?.length
      ? overrides[section]
      : staticContent[section];
  }
  return merged;
}
