# Combat testing rundown

Build `24118850` | Updated 2026-07-11

This is the complete testing surface for the current Combat Lab. It separates
what is already usable, what is collected automatically during normal play,
and the small number of observations that still need a deliberate in-game
check. No step reads memory, captures packets, injects code, or automates play.

## Usable now: no game testing required

| Capability | What TL-Helper uses | Boundary |
| --- | --- | --- |
| Base Damage interval projection | Reviewed formula rows at the two visible Base Damage endpoints | Pre-resolution only, not final damage/healing/shield capacity |
| Judgment Lightning component view | `ST_PowerAttack_DD` plus eight client-visible direct-damage effect variants | First and conditional second hit are distinct; no whole-ability total is claimed |
| Tooltip basis and level mapping | Verified tooltip display encoding and Epic/Heroic five-level windows | Does not prove server resolution |
| Heavy Attack magnitude evidence | Existing log pairs support normal resolved magnitude times `2.284` for the recorded build | Exact hidden precision and rounding remain open |
| Build planning and stat sources | Decoded items, skills, runes, attributes, sets, and provenance | Existing static-calculation scope only |

## Automatic collection during ordinary play

Enable the game's detailed battle log once. No transcription or test rotation is
needed. After any normal play session, run:

```powershell
cd D:\TL_Helper
$env:TL_DATA_ROOT = 'D:\TL_Data'
node scripts\import-combat-log-folder.mjs
```

The importer reads every `.txt` log under
`D:\TL_Data\calibration\24118850\combat-logs`, writes one normalized session
per source file, preserves the source hash, records Critical and Heavy flags,
and updates `reports\24118850\combat-logs\index.json`. It keeps effect IDs and
localized names separate. The resulting evidence is useful for:

- effect frequency and damage distributions;
- confirmed effect-to-skill mapping;
- Heavy magnitude pair detection;
- multi-hit clustering and warnings against treating rows as independent chance trials;
- finding new, unmapped effect IDs for review.

The detailed log currently has damage events only. It cannot establish healing,
shield capacity, buff expiry, or target defense by itself.

## Deliberate checks still worth doing

Do these only when the corresponding Combat Lab feature is wanted. Each has a
minimum useful capture and a stricter confirmation threshold. The automation
handles extraction, storage, comparison, and rejection of malformed evidence.

| Priority | Question | You capture | Minimum useful evidence | Confirmation threshold | Automation result |
| --- | --- | --- | --- | --- | --- |
| 1 | Does Healing Received affect self-healing or only external healing? | One short video showing a large Healing Received difference, first with self-heals and then with an ally heal if available | 6 non-overheal casts per condition, visible HP before/after and stat panel | 20 eligible casts per condition if the difference is small | Groups casts, rejects overheal/proc rows, compares observed shift against candidate operations |
| 2 | How does Cooldown Speed round? | Two visible cooldown timers for one skill, baseline and a large stat change | 3 casts per condition with timestamps | 5 per condition, including a decimal boundary | Fits duration candidates and reports any remaining rounding ambiguity |
| 3 | How does Buff Duration round? | A simple self-buff timer, baseline and a large duration-stat change | 3 timer captures per condition | 5 per condition, including an expiry boundary | Compares duration models without conflating refreshes or recipient effects |
| 4 | What is the defense mitigation curve? | Same unbuffed attack against two targets or two controlled defense values | 10 normal, non-Heavy, non-critical hits per value | 20 per value and a third defense point | Uses the logs, clusters repeated effects, and fits only curves supported by the data |
| Later | Hit, critical, Heavy, and block chance contests | Controlled duel video with both stat panels and a visible single-hit action | 30 clearly reviewable independent attempts per stat point | 50 to 100 attempts per point when fitting a probability curve | Reviewed OCR/manual classification counts outcomes; detailed combat logs are unavailable in PvP |
| Later | DoT/HoT tick alignment | A short recording with timestamps | One full application to expiry | Three repeats if timing differs | Extracts tick intervals and preserves a server-timing uncertainty label |

## What not to test now

Do not repeat Gaia Crash dummy testing to derive mitigation. The current
observations include uncontrolled context and cannot distinguish the server
pipeline. Do not perform dedicated chance testing until there are known target
stats or a simple controlled setup. Do not collect more screenshots for tooltip
basis, rarity mapping, or Heavy magnitude unless the game build changes.

## What happens after a capture

1. Put the detailed log in the existing `combat-logs` folder, or put a short
   recording/screenshot beside the calibration evidence.
2. Run the folder importer for damage logs. For a reviewed manual observation,
   use `scripts\record-combat-observation.mjs`.
3. TL-Helper keeps raw evidence immutable, evaluates the relevant candidate
   models, and reports whether the capture was enough to upgrade a stage.
4. A stage remains `unsupported` when the evidence cannot distinguish models.

The game's detailed Combat Log is limited to supported PvE boss content and
safe-zone Practice Dummies. It must not be assumed to record PvP. PvP contest
testing therefore uses user-created duel recordings, visible stat panels, and
reviewed outcome classification rather than the folder importer.

The best next human input is therefore not a long testing session: it is one
short Healing Received comparison with a large visible stat difference. Every
other pending check can wait until it supports a feature you actually want.
