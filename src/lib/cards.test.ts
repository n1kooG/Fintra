import { describe, expect, it } from "vitest";
import {
  availableCredit,
  buildStatement,
  closeDateBefore,
  closeDateOnOrAfter,
  currentStatements,
  dateInMonth,
  dueDateAfter,
  firstInstallmentDueDate,
  planProgress,
  planSchedule,
  splitInstallments,
  statementPayment,
} from "./cards";

describe("fechas del ciclo", () => {
  it("dateInMonth recorta al ultimo dia del mes", () => {
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2028-02", 30)).toBe("2028-02-29");
    expect(dateInMonth("2026-10", 31)).toBe("2026-10-31");
  });

  it("una compra hasta el dia de cierre (inclusive) entra a ese cierre", () => {
    expect(closeDateOnOrAfter("2026-09-10", 22)).toBe("2026-09-22");
    expect(closeDateOnOrAfter("2026-09-22", 22)).toBe("2026-09-22");
    expect(closeDateOnOrAfter("2026-09-23", 22)).toBe("2026-10-22");
    expect(closeDateOnOrAfter("2026-12-30", 22)).toBe("2027-01-22");
  });

  it("closeDateBefore es estrictamente anterior", () => {
    expect(closeDateBefore("2026-09-22", 22)).toBe("2026-08-22");
    expect(closeDateBefore("2026-09-23", 22)).toBe("2026-09-22");
    expect(closeDateBefore("2026-01-10", 22)).toBe("2025-12-22");
  });

  it("el vencimiento es el primer dia de pago posterior al cierre", () => {
    // Cierra el 22, paga el 5: vence el mes siguiente.
    expect(dueDateAfter("2026-09-22", 5)).toBe("2026-10-05");
    // Cierra el 5, paga el 20: vence el mismo mes.
    expect(dueDateAfter("2026-09-05", 20)).toBe("2026-09-20");
    expect(dueDateAfter("2026-12-22", 5)).toBe("2027-01-05");
  });

  it("primera cuota: cierre y vencimiento posteriores a la compra", () => {
    expect(firstInstallmentDueDate("2026-09-10", 22, 5)).toBe("2026-10-05");
    expect(firstInstallmentDueDate("2026-09-22", 22, 5)).toBe("2026-10-05");
    expect(firstInstallmentDueDate("2026-09-23", 22, 5)).toBe("2026-11-05");
  });

  it("dia de cierre 31 en febrero cierra el 28", () => {
    expect(closeDateOnOrAfter("2026-02-10", 31)).toBe("2026-02-28");
    expect(closeDateBefore("2026-03-01", 31)).toBe("2026-02-28");
  });
});

describe("splitInstallments", () => {
  it("reparte el total exacto, los sobrantes a las primeras cuotas", () => {
    expect(splitInstallments(100000n, 3)).toEqual([33334n, 33333n, 33333n]);
    expect(splitInstallments(270000n, 6)).toEqual([
      45000n,
      45000n,
      45000n,
      45000n,
      45000n,
      45000n,
    ]);
  });

  it("siempre suma el total", () => {
    const parts = splitInstallments(1234567n, 12);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1234567n);
    expect(parts).toHaveLength(12);
  });
});

describe("planSchedule / planProgress", () => {
  const plan = { totalMinor: 270000n, count: 6, firstDueDate: "2026-08-05", dueDay: 5 };
  const schedule = planSchedule(plan);

  it("una cuota por mes en el mismo dia de pago", () => {
    expect(schedule.map((e) => e.dueDate)).toEqual([
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
      "2027-01-05",
    ]);
    expect(schedule.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("dia de pago 31: febrero cae el 28 y marzo vuelve al 31", () => {
    const s = planSchedule({
      totalMinor: 90000n,
      count: 3,
      firstDueDate: "2027-01-31",
      dueDay: 31,
    });
    expect(s.map((e) => e.dueDate)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("el avance cuenta pagadas las anteriores a hoy; la que vence hoy sigue pendiente", () => {
    const p = planProgress(schedule, "2026-10-01");
    expect(p.paidCount).toBe(2);
    expect(p.remainingCount).toBe(4);
    expect(p.remainingMinor).toBe(180000n);
    expect(p.next?.number).toBe(3);
    expect(planProgress(schedule, "2026-10-05").next?.number).toBe(3);
    expect(planProgress(schedule, "2026-10-06").next?.number).toBe(4);
  });

  it("un plan terminado no tiene proxima cuota", () => {
    const p = planProgress(schedule, "2027-02-01");
    expect(p.next).toBeNull();
    expect(p.remainingCount).toBe(0);
    expect(p.paidCount).toBe(6);
  });
});

describe("availableCredit", () => {
  it("cupo menos deuda", () => {
    expect(availableCredit(800000n, -156400n)).toBe(643600n);
  });

  it("un saldo a favor no sube el cupo sobre el limite", () => {
    expect(availableCredit(800000n, 5000n)).toBe(800000n);
  });

  it("sobregirada queda negativo; sin cupo configurado es null", () => {
    expect(availableCredit(100000n, -130000n)).toBe(-30000n);
    expect(availableCredit(null, -130000n)).toBeNull();
  });
});

describe("estados de cuenta", () => {
  const days = { closeDay: 22, dueDay: 5 };
  // Tres compras en cuotas de 45.000, 32.500 y 18.900 que se cobran el 05-oct (= 96.400).
  const schedules = [
    planSchedule({
      totalMinor: 270000n,
      count: 6,
      firstDueDate: "2026-08-05",
      dueDay: 5,
    }),
    planSchedule({
      totalMinor: 390000n,
      count: 12,
      firstDueDate: "2026-03-05",
      dueDay: 5,
    }),
    planSchedule({ totalMinor: 56700n, count: 3, firstDueDate: "2026-10-05", dueDay: 5 }),
  ];

  it("suma compras de contado del periodo y las cuotas del vencimiento", () => {
    const st = buildStatement({
      closeDate: "2026-09-22",
      days,
      charges: [
        { date: "2026-08-22", amountMinor: 999n }, // el dia del cierre anterior NO entra
        { date: "2026-08-23", amountMinor: 10000n }, // primer dia del periodo
        { date: "2026-09-22", amountMinor: 5000n }, // el dia de cierre SI entra
        { date: "2026-09-23", amountMinor: 7777n }, // ya es del siguiente
      ],
      schedules,
      today: "2026-09-24",
    });
    expect(st.periodStart).toBe("2026-08-23");
    expect(st.dueDate).toBe("2026-10-05");
    expect(st.singlesMinor).toBe(15000n);
    expect(st.installmentsMinor).toBe(45000n + 32500n + 18900n);
    expect(st.totalMinor).toBe(15000n + 96400n);
    expect(st.closed).toBe(true);
  });

  it("currentStatements: facturado pendiente de pago + ciclo abierto", () => {
    const { billed, open } = currentStatements({
      today: "2026-09-24",
      days,
      charges: [],
      schedules,
    });
    expect(billed?.closeDate).toBe("2026-09-22");
    expect(billed?.dueDate).toBe("2026-10-05");
    expect(open.closeDate).toBe("2026-10-22");
    expect(open.dueDate).toBe("2026-11-05");
    expect(open.closed).toBe(false);
  });

  it("si el ultimo estado ya vencio, no hay facturado pendiente", () => {
    const { billed, open } = currentStatements({
      today: "2026-10-10",
      days,
      charges: [],
      schedules,
    });
    expect(billed).toBeNull();
    expect(open.closeDate).toBe("2026-10-22");
  });

  it("el dia de cierre el ciclo todavia esta abierto (cierra hoy)", () => {
    const { open } = currentStatements({
      today: "2026-10-22",
      days,
      charges: [],
      schedules,
    });
    expect(open.closeDate).toBe("2026-10-22");
    expect(open.closed).toBe(false);
  });

  it("un cambio del dia de pago no deja cuotas huerfanas (ventana de vencimiento)", () => {
    // La cuota se agendo el dia 5 pero la tarjeta ahora paga el 8.
    const st = buildStatement({
      closeDate: "2026-09-22",
      days: { closeDay: 22, dueDay: 8 },
      charges: [],
      schedules: [
        planSchedule({
          totalMinor: 30000n,
          count: 3,
          firstDueDate: "2026-10-05",
          dueDay: 5,
        }),
      ],
      today: "2026-09-24",
    });
    expect(st.dueDate).toBe("2026-10-08");
    expect(st.installmentsMinor).toBe(10000n);
  });
});

describe("statementPayment", () => {
  const statement = {
    closeDate: "2026-09-22",
    dueDate: "2026-10-05",
    periodStart: "2026-08-23",
    singlesMinor: 200_000n,
    installmentsMinor: 100_000n,
    totalMinor: 300_000n,
    closed: true,
  };

  it("sin pagos esta sin pagar y falta todo el total", () => {
    expect(statementPayment(statement, [])).toEqual({
      paidMinor: 0n,
      remainingMinor: 300_000n,
      status: "unpaid",
    });
  });

  it("un pago parcial entre el cierre y el vencimiento deja la diferencia", () => {
    const result = statementPayment(statement, [
      { date: "2026-10-01", amountMinor: 120_000n },
    ])!;
    expect(result.status).toBe("partial");
    expect(result.remainingMinor).toBe(180_000n);
  });

  it("varios pagos suman; cubrir el total (o mas) lo da por pagado", () => {
    const paid = statementPayment(statement, [
      { date: "2026-09-25", amountMinor: 100_000n },
      { date: "2026-10-05", amountMinor: 250_000n },
    ])!;
    expect(paid.status).toBe("paid");
    expect(paid.remainingMinor).toBe(0n);
    expect(paid.paidMinor).toBe(350_000n);
  });

  it("los limites: el dia del cierre no cuenta, el del vencimiento si", () => {
    expect(
      statementPayment(statement, [{ date: "2026-09-22", amountMinor: 300_000n }])!
        .status,
    ).toBe("unpaid");
    expect(
      statementPayment(statement, [{ date: "2026-10-05", amountMinor: 300_000n }])!
        .status,
    ).toBe("paid");
    expect(
      statementPayment(statement, [{ date: "2026-10-06", amountMinor: 300_000n }])!
        .status,
    ).toBe("unpaid");
  });

  it("un pago anterior al cierre no es de este estado de cuenta", () => {
    expect(
      statementPayment(statement, [{ date: "2026-09-10", amountMinor: 300_000n }])!
        .status,
    ).toBe("unpaid");
  });

  it("sin nada que pagar no hay estado", () => {
    expect(statementPayment({ ...statement, totalMinor: 0n }, [])).toBeNull();
  });
});
