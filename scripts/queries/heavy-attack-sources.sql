-- All currently indexed Heavy Attack Chance sources, including general,
-- melee, ranged, magic, PvP, boss, and directional variants.
-- Optional traits and randomized resonance are intentionally returned with
-- their conditions_json so callers can distinguish them from inherent stats.
SELECT
  source_type,
  source_id,
  source_name,
  source_component,
  canonical_stat_id,
  raw_stat_id,
  value,
  unit,
  level,
  rank,
  attack_scope,
  context_json,
  conditions_json,
  confidence
FROM stat_sources
WHERE stat_family_id = 'heavy_attack_chance'
ORDER BY source_type, source_name, source_component, COALESCE(level, rank);
