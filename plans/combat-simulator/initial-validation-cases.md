# Initial validation cases

Build 24118850 · decoder 0.2.0 · All row IDs verified present in `TL_DATA_ROOT\decoded\24118850\tables\TLFormulaParameterNew.json` on 2026-07-11.

Selection: the smallest real ability set that exercises damage, healing, shielding, mitigation-side effects, buffs, debuffs (incl. DoT + CC), and party effects, with one deliberately simple and one multi-stage/conditional case. Each case lists the decoded evidence and what the in-game calibration must confirm.

## 1. Staff - Judgment Lightning (`WP_ST_S_PowerAttack`) - SIMPLE first-hit damage

- First-hit formula: `ST_PowerAttack_DD` L1 = `kAmountFromAttackPower, mul=71000, add=188` → tooltip "710% of Base Damage + 188" (`tooltip1=710, tooltip2=188`). This is a **per-hit component**, not a whole-ability total.
- Confirmed combat-log mapping: `950004896` is the first cast (`WP_ST_S_PowerAttack`); `968485880` is the conditional second cast (`WP_ST_S_PowerAttack_2`). Preserve these as distinct cast variants. The condition and aggregation rule do not establish a safe whole-ability total.
- Variants present: `_DD_Boss` (monster split), `_DD_Wet` (Wet/Frost AoE), and Burning/Ignite conditional second-cast metadata.
- Calibrate: basis (10000=100%), which attack-power value ("Base Damage" = min..max roll?), rounding, conditional trigger and the relationship between first/second cast components.

## 2. Bow — Power Shot (`WP_BO_S_PowerShot`) — MULTI-STAGE / CONDITIONAL

- Charge scaling: `BO_PowerShot_Charge_DD` L1 `mul=50000, add=53, min=10000, max=16000` (charge multiplies damage 1.0×→1.6×; tooltip uses inline math `tooltip1*max/min`). 21 levels to `mul=83000, add=583`.
- Conditionals: `_Boss_Tooltip` (180% vs bosses), `BO_PowerShot_Charge_Shield_DamageUp` (+40% context), hero specialization `BO_PowerShot_Hero_CriticalChance_Up` (+2000..4000 crit points, duration row 3000 ms).
- Behavior: `TLSkill[WP_BO_S_PowerShot]` — projectile 4000 speed, wind-affected, `skill_delay 2.5`, `hit_delay 0.8`; charge specializations exist as separate skill rows (`_Charge`, `_Charge_CanMove`, …).
- Calibrate: charge-time→multiplier mapping, whether crit-points buff shifts observed crit rate (feeds contest-curve calibration).

## 3. Wand — Swift Healing (`WP_WA_S_Heal`) — HEALING

- `WA_Heal_Heal` L1 = `kAmountFromAttackPower, mul=16500, add=200, dynamic_stat_id1=HealEffect` → 165% AP + 200 modulated by heal-effect stat.
- Crit-style branches: `WA_Heal_Heal_Double` / `_Triple`; display row `WA_Heal_ToolTip`; trait `WA_Heal_Rare_SkillHealTakenModifier` (+duration row).
- Calibrate: which AP (main-hand? wand-specific?), how `HealEffect` enters (additive vs multiplicative), overheal handling.

## 4. Orb — Distortion Veil (`WP_ORB_Active_Shield`) — SHIELDING

- Capacity: `ORB_Active_Shield_ShieldHp` uses `kAmountFromAttackPower`; L1 is `mul=30000, add=600` (300% of Base Damage + 600), rising to `mul=48800, add=1900` at L21.
- Duration: `ORB_Active_Shield_Duration` is 3000 ms / 3s. Both rows have exact localization-linked owner evidence.
- Calibrate: which Base Damage value is selected, the `ORB_Active_Shield_ShieldHp` dynamic-stat operation, shield-health rounding, depletion/expiry ordering, and the Mana-refund interaction.

Correction: Stalwart Bastion is a Sword damage-reduction buff, not a shield. The similarly named `SW2_ShieldBuff_Absorption_*` rows belong to DaVinci's Courage/shared greatsword effects and represent Max Health, Health Regen, and Attack Speed rather than shield capacity.

## 5. Sword — Provoking Roar (`SW_TauntBuff_*`) — CC/DEBUFF + TANKING

- Rows: `SW_TauntBuff_DD`, `_Taunt_Rate`, `_Taunt_Duration` (+`_NPC` variant) — a client-visible CC accuracy/duration pair.
- Abnormal side: taunt/CC mechanics come from `TLAbnormalState_*` rows (Disable*/Prevent* flags, `StackCap`).
- Calibrate: `Rate` semantics vs CC-accuracy/tolerance stats (register #4/#5 analog for CC).

## 6. Dagger — poison DoT (`DA_PoisonEnchant_Poison_*`) — DoT DEBUFF

- Rows: `_Poison_DD` (per-tick magnitude), `DA_ContextSkill_Poison_Rate`, `_Duration`; `_NPC`/`_NPC_Tooltip` variants.
- Calibrate: tick interval + alignment (register #10), stacking with `StackCap` from the abnormal row.

## 7. Wand — Curse Explosion (`WP_WA_GR_S_PartyCurseBurst`) — PARTY EFFECT

- Per-stack rows: `WA_PartyCurseBurst_DD_to_NoStack/_OneStack/_TwoStack/_ThreeStack` + `_DD_Rate` — damage scales with party-applied curse stacks; the cleanest decoded example of a party-context conditional.
- Calibrate: stack counting across party members, simultaneous-consumption behavior.

## Coverage matrix

| Requirement | Case |
| --- | --- |
| damage (simple) | 1 |
| damage (multi-stage/conditional) | 2 |
| healing | 3 |
| shielding | 4 |
| mitigation-side (defensive buff, taunt) | 4, 5 |
| buff | 2 (crit buff), 4 |
| debuff / DoT / CC | 5, 6 |
| party effect | 7 |
| PvE/boss conditional | 1 (`_PVE`), 2 (`_Boss`) |

Every case follows the test-case record schema in 04-data-and-calibration.md (gameBuild, ability, level, observedOutcome, evidence) and the safe-calibration rules: manual entry, screenshots, or user recordings only — no process inspection, packet capture, or automation.
