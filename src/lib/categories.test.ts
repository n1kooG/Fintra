import { describe, expect, it } from "vitest";
import {
  categoryLabels,
  checkParent,
  orderCategories,
  rollUpToBudgeted,
  withDescendants,
  type CategoryLike,
} from "./categories";

function cat(
  id: string,
  name: string,
  parent_id: string | null = null,
  kind: "income" | "expense" = "expense",
  sort_order = 0,
): CategoryLike {
  return { id, name, kind, parent_id, sort_order };
}

const tree: CategoryLike[] = [
  cat("food", "Alimentación", null, "expense", 0),
  cat("market", "Supermercado", "food"),
  cat("rest", "Restaurantes", "food"),
  cat("transport", "Transporte", null, "expense", 1),
  cat("salary", "Sueldo", null, "income", 0),
];

describe("orderCategories", () => {
  it("deja cada subcategoria justo despues de su principal", () => {
    const out = orderCategories(tree.filter((c) => c.kind === "expense"));
    expect(out.map((c) => c.name)).toEqual([
      "Alimentación",
      "Restaurantes",
      "Supermercado",
      "Transporte",
    ]);
    expect(out.map((c) => c.depth)).toEqual([0, 1, 1, 0]);
  });

  it("rotula las subcategorias con el nombre de su principal", () => {
    const labels = categoryLabels(tree);
    expect(labels.get("market")).toBe("Alimentación › Supermercado");
    expect(labels.get("food")).toBe("Alimentación");
  });

  it("trata como principal a una subcategoria cuyo padre no esta en la lista", () => {
    const onlyChildren = [cat("market", "Supermercado", "food")];
    const out = orderCategories(onlyChildren);
    expect(out[0]).toMatchObject({ depth: 0, label: "Supermercado" });
  });

  it("respeta sort_order y desempata por nombre", () => {
    const out = orderCategories([
      cat("b", "Beta", null, "expense", 0),
      cat("a", "Alfa", null, "expense", 0),
    ]);
    expect(out.map((c) => c.name)).toEqual(["Alfa", "Beta"]);
  });
});

describe("withDescendants", () => {
  it("incluye la categoria y sus subcategorias", () => {
    expect(withDescendants(tree, "food").sort()).toEqual(["food", "market", "rest"]);
    expect(withDescendants(tree, "transport")).toEqual(["transport"]);
  });
});

describe("checkParent", () => {
  it("permite dejarla como principal", () => {
    expect(checkParent(tree, "market", null, "expense")).toBeNull();
  });

  it("permite colgarla de una principal del mismo tipo", () => {
    expect(checkParent(tree, "transport", "food", "expense")).toBeNull();
    expect(checkParent(tree, null, "food", "expense")).toBeNull();
  });

  it("rechaza ser su propia principal", () => {
    expect(checkParent(tree, "food", "food", "expense")).toMatch(/sí misma/);
  });

  it("rechaza un padre inexistente", () => {
    expect(checkParent(tree, "transport", "nope", "expense")).toMatch(/No encontramos/);
  });

  it("rechaza mezclar ingreso y gasto", () => {
    expect(checkParent(tree, "transport", "salary", "expense")).toMatch(/mismo tipo/);
  });

  it("rechaza un tercer nivel (colgar de una subcategoria)", () => {
    expect(checkParent(tree, "transport", "market", "expense")).toMatch(/dos niveles/);
  });

  it("rechaza convertir en subcategoria a una que ya tiene hijas", () => {
    expect(checkParent(tree, "food", "transport", "expense")).toMatch(
      /ya tiene subcategorías/,
    );
  });
});

describe("rollUpToBudgeted", () => {
  const expenses = [
    { id: 1, category_id: "market" },
    { id: 2, category_id: "food" },
    { id: 3, category_id: "transport" },
    { id: 4, category_id: null },
  ];

  it("suma al presupuesto del padre lo gastado en sus subcategorias", () => {
    const out = rollUpToBudgeted(expenses, tree, new Set(["food"]));
    expect(out.map((e) => e.category_id)).toEqual(["food", "food", "transport", null]);
  });

  it("si la subcategoria tiene presupuesto propio, se queda con el", () => {
    const out = rollUpToBudgeted(expenses, tree, new Set(["food", "market"]));
    expect(out.map((e) => e.category_id)).toEqual(["market", "food", "transport", null]);
  });

  it("no toca nada si no hay presupuestos que apliquen", () => {
    const out = rollUpToBudgeted(expenses, tree, new Set(["transport"]));
    expect(out).toEqual(expenses);
  });

  it("no muta las filas originales", () => {
    const original = { category_id: "market" };
    rollUpToBudgeted([original], tree, new Set(["food"]));
    expect(original.category_id).toBe("market");
  });
});
