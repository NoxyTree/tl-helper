# Questlog contest-curve reference evidence

Collected 2026-07-10 against build `24118850` docs. Precision tier:
**`derived_community_reference`** — this records Questlog's model, not verified
game behavior. It may not upgrade any engine formula past `modeled` without
independent in-game calibration.

Raw probe rows: `D:\TL_Data\reports\24118850\evidence\questlog-contest-curves.json`.

## Source and method

- Page: `https://questlog.gg/throne-and-liberty/en/character-builder/TheSilenceOfTheArmoredImprovement/combat-simulator`
- The page's "Combat Simulator" is a two-build stat-contest calculator with
  custom-stat inputs per contest and per damage type (melee/magic/ranged).
- Method 1, behavioral: set each custom input programmatically and read the
  displayed percentage (17 evasion points, 11 crit, 19 heavy attack, 11 skill
  damage, 5 hit points).
- Method 2, analytic: located the contest-formula module in the site's public
  JS bundle (`20fBMlSu.js`, an 862-byte module) and confirmed the fitted curve
  matches the shipped functions. The code is not reproduced; the formulas below
  are a mathematical restatement.
- No game client, process memory, packet capture, or automation of gameplay
  was involved.

## Questlog's model

One curve, constant `1000`, for every stat contest:

```text
chance% = max(0, A − B) / ((A − B) + 1000) × 100        clamped to [0, 100]
```

- Applied per damage type to: evasion vs hit, endurance vs critical hit
  chance, heavy attack evasion vs heavy attack chance, and skill damage
  resistance vs skill damage boost.
- Signed variants: when the attacker leads, the display shows the negative of
  the mirrored curve, i.e. `−((B − A) / ((B − A) + 1000) × 100)`.
- Two percent-saturation helpers of shape `t / (t + 100) × 100` also exist in
  the module (consumer stats unidentified).
- No base miss chance: hit ≥ evasion displays a flat 100% hit chance.
- Every non-anomalous probe point matched the curve to display precision
  (±0.05, consistent with the page rounding its displayed base stats).

## Known gaps in this evidence

- Display anomaly: panels flip to `100.00%` once the attacker-side surplus
  curve would exceed ~50%. The bundle functions are clamped to `[0, 100]` or
  signed-mirrored, so this is presumed display-layer behavior. Unresolved.
- The simulator contains **no Base Damage roll or damage-magnitude logic**;
  its loaded bundles have no min/max damage handling at all. It cannot answer
  Base Damage selection, rounding, mitigation, or pipeline order.
- Whether Questlog's `1000` constant is itself extracted, calibrated, or
  assumed by their team is unknown.

## User-reported hypothesis (untested)

The project owner reports (2026-07-10) that live Base Damage is believed to be
a **per-cast roll between the displayed minimum and maximum**, and that this
may be ability-dependent. This matches the "per-use roll" candidate in
`docs/combat-calibration-first-protocol.md` groups 4–7 and is recorded here as
a hypothesis only. It carries no precision upgrade until the Swift Healing
A/B/C datasets discriminate the candidate models.

## Effect on the unknown-formula register

Register entries 3, 4, and 5 (hit/evasion, crit/endurance, heavy/double
contest curves) now have a community reference model and remain
**calibration-required**. The engine may register this curve only as
`modeled` with provenance pointing at this document, never as extracted or
verified.
