import { describe, expect, it } from "vitest";
import { ALL_TOPICS, NOTICE_TOPICS, buildNotices, parseTopics } from "./notifications";
import type { CalendarEvent } from "./calendar";
import type { BudgetLineView } from "./budgeting";

const TODAY = "2026-10-15";

const event = (
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "date" | "kind">,
): CalendarEvent => ({
  label: "Evento",
  amountMinor: -50000n,
  currency: "CLP",
  estimated: false,
  ...overrides,
});

const line = (overrides: Partial<BudgetLineView>): BudgetLineView => ({
  id: "b1",
  categoryId: "c1",
  categoryName: "Restaurantes",
  amountMinor: 100000n,
  baseMinor: 100000n,
  carryMinor: 0n,
  committedMinor: 0n,
  availableMinor: 100000n,
  currency: "CLP",
  spentMinor: 0n,
  remainingMinor: 100000n,
  percent: 0,
  status: "ok",
  unconverted: 0,
  ...overrides,
});

describe("buildNotices · calendario", () => {
  it("la facturacion de una tarjeta avisa desde 3 dias antes, con 'hoy', 'mañana' o 'en N dias'", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [
        event({
          id: "bill:cmr:2026-10-18",
          date: "2026-10-18",
          kind: "card_billing",
          label: "Facturación CMR",
        }),
        event({
          id: "bill:visa:2026-10-16",
          date: "2026-10-16",
          kind: "card_billing",
          label: "Facturación Visa",
        }),
        event({
          id: "bill:old:2026-10-15",
          date: "2026-10-15",
          kind: "card_billing",
          label: "Facturación Vieja",
        }),
        event({
          id: "bill:lejos:2026-10-19",
          date: "2026-10-19",
          kind: "card_billing",
          label: "Facturación Lejos",
        }),
      ],
      budgetLines: [],
    });
    expect(notices.map((n) => [n.title, n.body])).toEqual([
      ["Facturación CMR", "Vence en 3 días · $50.000"],
      ["Facturación Visa", "Vence mañana · $50.000"],
      ["Facturación Vieja", "Vence hoy · $50.000"],
    ]);
    expect(notices.every((n) => n.url === "/tarjetas")).toBe(true);
  });

  it("marca como estimada la facturacion de un ciclo abierto", () => {
    const [notice] = buildNotices({
      today: TODAY,
      events: [
        event({
          id: "bill:cmr:2026-10-17",
          date: "2026-10-17",
          kind: "card_billing",
          estimated: true,
        }),
      ],
      budgetLines: [],
    });
    expect(notice.body).toContain("(estimado)");
  });

  it("una cuota de prestamo avisa el dia anterior y el mismo dia, no antes", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [
        event({
          id: "loan:a:1",
          date: "2026-10-15",
          kind: "loan",
          label: "Cuota auto (1/6)",
        }),
        event({
          id: "loan:b:1",
          date: "2026-10-16",
          kind: "loan",
          label: "Cuota casa (1/6)",
        }),
        event({
          id: "loan:c:1",
          date: "2026-10-17",
          kind: "loan",
          label: "Cuota otra (1/6)",
        }),
      ],
      budgetLines: [],
    });
    expect(notices.map((n) => n.title)).toEqual(["Cuota auto (1/6)", "Cuota casa (1/6)"]);
  });

  it("un recurrente avisa solo el dia anterior (lo de hoy ya es un movimiento real)", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [
        event({
          id: "rule:r1:2026-10-16",
          date: "2026-10-16",
          kind: "expense",
          label: "Arriendo",
          amountMinor: -420000n,
        }),
        event({
          id: "rule:r2:2026-10-16",
          date: "2026-10-16",
          kind: "income",
          label: "Sueldo",
          amountMinor: 1850000n,
        }),
        event({
          id: "rule:r3:2026-10-15",
          date: "2026-10-15",
          kind: "expense",
          label: "Hoy",
        }),
        event({
          id: "rule:r4:2026-10-20",
          date: "2026-10-20",
          kind: "expense",
          label: "Lejos",
        }),
      ],
      budgetLines: [],
    });
    expect(notices.map((n) => [n.title, n.body])).toEqual([
      ["Arriendo", "Mañana se descuenta $420.000"],
      ["Sueldo", "Mañana debería llegar $1.850.000"],
    ]);
  });

  it("ignora eventos sin monto (cierres) y los ya pasados", () => {
    expect(
      buildNotices({
        today: TODAY,
        events: [
          event({
            id: "close:x",
            date: "2026-10-16",
            kind: "card_close",
            amountMinor: null,
          }),
          event({ id: "bill:y:2026-10-10", date: "2026-10-10", kind: "card_billing" }),
        ],
        budgetLines: [],
      }),
    ).toEqual([]);
  });

  it("la key es estable: el mismo vencimiento siempre produce el mismo aviso", () => {
    const e = event({
      id: "bill:cmr:2026-10-17",
      date: "2026-10-17",
      kind: "card_billing",
    });
    const a = buildNotices({ today: TODAY, events: [e], budgetLines: [] });
    const b = buildNotices({ today: "2026-10-16", events: [e], budgetLines: [] });
    expect(a[0].key).toBe(b[0].key);
  });
});

describe("buildNotices · depositos a plazo", () => {
  it("avisa desde 3 dias antes de que venza un deposito, con lo que se recibe", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [
        event({
          id: "maturity:d1:2026-10-17",
          date: "2026-10-17",
          kind: "deposit_maturity",
          label: "Vence DAP BancoEstado",
          amountMinor: 1_013_650n,
        }),
        event({
          id: "maturity:d2:2026-10-25",
          date: "2026-10-25",
          kind: "deposit_maturity",
          label: "Vence DAP Lejano",
          amountMinor: 500_000n,
        }),
      ],
      budgetLines: [],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      key: "maturity:maturity:d1:2026-10-17",
      title: "Vence DAP BancoEstado",
      url: "/inversiones",
    });
    expect(notices[0].body).toContain("en 2 días");
    expect(notices[0].body).toContain("1.013.650");
  });
});

describe("buildNotices · cupo de tarjeta", () => {
  it("avisa desde el 80% del cupo, una vez al mes", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [],
      cards: [
        { id: "cmr", name: "CMR", usedPercent: 85 },
        { id: "visa", name: "Visa", usedPercent: 79 },
        { id: "lider", name: "Lider", usedPercent: 100 },
      ],
    });
    expect(notices.map((n) => n.key)).toEqual([
      "limit:cmr:2026-10",
      "limit:lider:2026-10",
    ]);
    expect(notices[0].title).toContain("85%");
    expect(notices[1].body).toContain("límite");
    expect(notices[0].url).toBe("/tarjetas");
  });

  it("sin tarjetas no hay avisos de cupo", () => {
    expect(buildNotices({ today: TODAY, events: [], budgetLines: [] })).toEqual([]);
  });
});

describe("buildNotices · presupuestos", () => {
  it("avisa al 80% (quedan X de Y)", () => {
    const [notice] = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [
        line({
          status: "warning",
          percent: 85,
          spentMinor: 85000n,
          remainingMinor: 15000n,
        }),
      ],
    });
    expect(notice).toMatchObject({
      key: "budget:b1:warning",
      title: "Restaurantes: 85% del presupuesto",
      body: "Te quedan $15.000 de $100.000",
      url: "/presupuestos",
    });
  });

  it("avisa al pasarse y al llegar justo al tope, con textos distintos", () => {
    const over = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [
        line({
          status: "over",
          percent: 120,
          spentMinor: 120000n,
          remainingMinor: -20000n,
        }),
      ],
    })[0];
    expect(over.title).toBe("Presupuesto excedido: Restaurantes");
    expect(over.body).toBe("Llevas 120% ($120.000 de $100.000)");

    const exact = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [
        line({ status: "over", percent: 100, spentMinor: 100000n, remainingMinor: 0n }),
      ],
    })[0];
    expect(exact.title).toBe("Presupuesto al tope: Restaurantes");
  });

  it("dentro del presupuesto no hay aviso; un tramo no repite el aviso del otro", () => {
    expect(buildNotices({ today: TODAY, events: [], budgetLines: [line({})] })).toEqual(
      [],
    );
    const warning = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [line({ status: "warning", percent: 90 })],
    });
    const over = buildNotices({
      today: TODAY,
      events: [],
      budgetLines: [line({ status: "over", percent: 101 })],
    });
    expect(warning[0].key).not.toBe(over[0].key);
    // El mismo tag: el aviso de exceso reemplaza al de 80% en el telefono.
    expect(warning[0].tag).toBe(over[0].tag);
  });
});

describe("temas de aviso", () => {
  it("cada tipo de aviso queda etiquetado con su tema", () => {
    const notices = buildNotices({
      today: TODAY,
      events: [
        event({ id: "b1", date: "2026-10-16", kind: "card_billing" }),
        event({ id: "l1", date: "2026-10-16", kind: "loan" }),
        event({
          id: "d1",
          date: "2026-10-16",
          kind: "deposit_maturity",
          amountMinor: 1000n,
        }),
        event({ id: "r1", date: "2026-10-16", kind: "expense" }),
        event({ id: "r2", date: "2026-10-16", kind: "income", amountMinor: 900000n }),
      ],
      budgetLines: [line({ status: "over", percent: 120, remainingMinor: -20000n })],
      cards: [{ id: "k1", name: "Visa", usedPercent: 90 }],
    });
    const byKey = Object.fromEntries(notices.map((n) => [n.key, n.topic]));
    expect(byKey["card:b1"]).toBe("cards");
    expect(byKey["due:l1"]).toBe("loans");
    expect(byKey["maturity:d1"]).toBe("deposits");
    expect(byKey["due:r1"]).toBe("recurring");
    expect(byKey["due:r2"]).toBe("recurring");
    expect(byKey["limit:k1:2026-10"]).toBe("cards");
    expect(byKey["budget:b1:over"]).toBe("budgets");
    expect(notices.every((n) => ALL_TOPICS.includes(n.topic))).toBe(true);
  });

  it("parseTopics deja solo temas conocidos, sin repetir y en orden estable", () => {
    expect(parseTopics(["budgets", "cards", "cards", "inventado", 5])).toEqual([
      "cards",
      "budgets",
    ]);
    expect(parseTopics([])).toEqual([]);
    expect(parseTopics(null)).toEqual([]);
    expect(parseTopics("cards")).toEqual([]);
  });

  it("la lista de temas no tiene ids repetidos", () => {
    expect(new Set(NOTICE_TOPICS.map((t) => t.id)).size).toBe(NOTICE_TOPICS.length);
  });
});
