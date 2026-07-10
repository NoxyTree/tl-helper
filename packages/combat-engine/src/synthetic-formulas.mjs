import { FormulaRegistry, PRECISION } from "./formulas.mjs";

const SYNTHETIC_META = Object.freeze({
  gameBuild: "synthetic-milestone-2",
  sourceTable: "synthetic-fixtures",
  precision: PRECISION.MODELED,
  provenance: "synthetic",
  traceMetadata: { scope: "Milestone 2 architecture fixture", realGameFormula: false },
});

export function createSyntheticFormulaRegistry() {
  return new FormulaRegistry()
    .register({
      ...SYNTHETIC_META,
      id: "synthetic.amount.v1",
      sourceRow: "amount",
      calculate: ({ amount }, { fixed, trace }) => fixed.add(amount, 0n, trace),
    })
    .register({
      ...SYNTHETIC_META,
      id: "synthetic.decrease.v1",
      sourceRow: "bounded-decrease",
      calculate: ({ current, amount }, { fixed, trace }) => {
        const applied = amount > current ? current : amount;
        return { current: fixed.subtract(current, applied, trace), applied };
      },
    })
    .register({
      ...SYNTHETIC_META,
      id: "synthetic.increase.v1",
      sourceRow: "bounded-increase",
      calculate: ({ current, maximum, amount }, { fixed, trace }) => {
        const room = fixed.subtract(maximum, current, trace);
        const applied = amount > room ? room : amount;
        const next = fixed.add(current, applied, trace);
        const overflow = fixed.subtract(amount, applied, trace);
        return { current: next, applied, overflow };
      },
    })
    .register({
      ...SYNTHETIC_META,
      id: "synthetic.shield-absorb.v1",
      sourceRow: "shield-absorb",
      calculate: ({ capacity, damage }, { fixed, trace }) => {
        const absorbed = damage > capacity ? capacity : damage;
        return {
          capacity: fixed.subtract(capacity, absorbed, trace),
          damage: fixed.subtract(damage, absorbed, trace),
          absorbed,
        };
      },
    })
    .register({
      ...SYNTHETIC_META,
      id: "synthetic.static-mitigated-damage.v1",
      sourceRow: "static-mitigated-damage-forced-outcome",
      traceMetadata: {
        scope: "Milestone 2 synthetic damage branch fixture",
        realGameFormula: false,
        outcomeSelection: "forced test input",
      },
      calculate: ({ amount, targetMitigation, outcome, criticalMultiplier }, { fixed, trace }) => {
        const zero = fixed.from(0);
        const one = fixed.from(1);
        if (targetMitigation < zero || targetMitigation > one) {
          throw new RangeError("Synthetic targetMitigation must be between 0 and 1.");
        }
        if (outcome !== "normal" && outcome !== "critical") {
          throw new RangeError("Synthetic damage outcome must be forced to normal or critical.");
        }

        const mitigationFactor = fixed.subtract(one, targetMitigation, trace);
        const mitigatedDamage = fixed.multiply(amount, mitigationFactor, trace);
        if (outcome === "normal") return fixed.add(mitigatedDamage, zero, trace);
        if (typeof criticalMultiplier !== "bigint" || criticalMultiplier < one) {
          throw new RangeError("Synthetic criticalMultiplier must be a scaled bigint greater than or equal to 1.");
        }
        return fixed.multiply(mitigatedDamage, criticalMultiplier, trace);
      },
    })
    .register({
      ...SYNTHETIC_META,
      id: "tl.unknown-damage-pipeline",
      sourceRow: "unknown-formulas.md#1",
      precision: PRECISION.UNSUPPORTED,
      provenance: "unresolved",
      unsupportedReason: "TL damage pipeline order is not established",
      calculate: undefined,
    });
}
