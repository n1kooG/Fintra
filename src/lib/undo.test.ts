import { describe, expect, it } from "vitest";
import { checkSnapshot, referencedIds } from "./undo";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function tx(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: U(n),
    account_id: U(100),
    category_id: U(200),
    type: "expense",
    amount_minor: "-12345",
    currency: "CLP",
    fx_rate: null,
    occurred_on: "2026-10-01",
    merchant: "Tienda",
    notes: null,
    recurring_rule_id: null,
    created_at: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

const base = (overrides: Record<string, unknown> = {}) => ({
  transactions: [tx(1)],
  transfers: [],
  plans: [],
  tagLinks: [],
  ...overrides,
});

describe("checkSnapshot", () => {
  it("acepta una copia valida de un gasto", () => {
    expect(checkSnapshot(base()).ok).toBe(true);
  });

  it("acepta una transferencia con sus dos piernas y etiquetas", () => {
    const result = checkSnapshot(
      base({
        transactions: [
          tx(1, { type: "transfer", category_id: null }),
          tx(2, { type: "transfer", category_id: null, amount_minor: "12345" }),
        ],
        transfers: [{ id: U(10), from_transaction_id: U(1), to_transaction_id: U(2) }],
        tagLinks: [{ transaction_id: U(1), tag_id: U(300) }],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("acepta un plan de cuotas ligado a su compra", () => {
    const result = checkSnapshot(
      base({
        plans: [
          {
            id: U(20),
            account_id: U(100),
            transaction_id: U(1),
            installments_count: 6,
            total_minor: "12345",
            first_due_date: "2026-11-05",
            due_day: 5,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rechaza columnas desconocidas (no deja colar household_id ni created_by)", () => {
    expect(
      checkSnapshot(base({ transactions: [tx(1, { household_id: U(999) })] })).ok,
    ).toBe(false);
    expect(
      checkSnapshot(base({ transactions: [tx(1, { created_by: U(999) })] })).ok,
    ).toBe(false);
  });

  it("rechaza ids, montos y fechas mal formados", () => {
    expect(checkSnapshot(base({ transactions: [tx(1, { id: "x" })] })).ok).toBe(false);
    expect(
      checkSnapshot(base({ transactions: [tx(1, { amount_minor: "1e9" })] })).ok,
    ).toBe(false);
    expect(
      checkSnapshot(base({ transactions: [tx(1, { occurred_on: "ayer" })] })).ok,
    ).toBe(false);
    expect(checkSnapshot(base({ transactions: [tx(1, { type: "otro" })] })).ok).toBe(
      false,
    );
    expect(checkSnapshot(base({ transactions: [tx(1, { currency: "BTC" })] })).ok).toBe(
      false,
    );
  });

  it("rechaza copias vacias, repetidas o que no son un objeto", () => {
    expect(checkSnapshot(base({ transactions: [] })).ok).toBe(false);
    expect(checkSnapshot(base({ transactions: [tx(1), tx(1)] })).ok).toBe(false);
    expect(checkSnapshot(null).ok).toBe(false);
    expect(checkSnapshot("hola").ok).toBe(false);
  });

  it("rechaza referencias a movimientos que no estan en la copia", () => {
    expect(
      checkSnapshot(
        base({
          transfers: [{ id: U(10), from_transaction_id: U(1), to_transaction_id: U(2) }],
        }),
      ).ok,
    ).toBe(false);
    expect(
      checkSnapshot(base({ tagLinks: [{ transaction_id: U(9), tag_id: U(300) }] })).ok,
    ).toBe(false);
  });

  it("limita el tamano de la copia", () => {
    const many = Array.from({ length: 501 }, (_, i) => tx(i + 1));
    expect(checkSnapshot(base({ transactions: many })).ok).toBe(false);
  });
});

describe("referencedIds", () => {
  it("junta cuentas, categorias y reglas sin repetir", () => {
    const check = checkSnapshot(
      base({
        transactions: [
          tx(1, { recurring_rule_id: U(400) }),
          tx(2, { account_id: U(101), category_id: null }),
        ],
      }),
    );
    if (!check.ok) throw new Error("la copia deberia ser valida");
    const ids = referencedIds(check.snapshot);
    expect(ids.accounts.sort()).toEqual([U(100), U(101)]);
    expect(ids.categories).toEqual([U(200)]);
    expect(ids.rules).toEqual([U(400)]);
  });
});
