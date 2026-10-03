import { describe, expect, it } from "vitest";
import { matchRule, normalizeText, type CategorizationRule } from "./categorization";

const rules: CategorizationRule[] = [
  { id: "1", pattern: "uber", categoryId: "transporte", kind: "expense" },
  { id: "2", pattern: "Uber Eats", categoryId: "restaurantes", kind: "expense" },
  { id: "3", pattern: "líder", categoryId: "super", kind: "expense" },
  { id: "4", pattern: "empresa", categoryId: "sueldo", kind: "income" },
];

describe("normalizeText", () => {
  it("quita tildes, conserva la ñ, baja a minusculas y colapsa espacios", () => {
    expect(normalizeText("  Café   ÑUÑOA ")).toBe("cafe ñuñoa");
  });
});

describe("matchRule", () => {
  it("coincide por contenido, sin importar mayusculas ni tildes", () => {
    expect(matchRule("UBER *TRIP", "expense", rules)?.categoryId).toBe("transporte");
    expect(matchRule("Lider Express Providencia", "expense", rules)?.categoryId).toBe(
      "super",
    );
  });

  it("gana el patron mas especifico (mas largo)", () => {
    expect(matchRule("UBER EATS SANTIAGO", "expense", rules)?.categoryId).toBe(
      "restaurantes",
    );
  });

  it("no cruza tipos: una regla de ingreso no categoriza un gasto", () => {
    expect(matchRule("Empresa SpA", "expense", rules)).toBeNull();
    expect(matchRule("Empresa SpA", "income", rules)?.categoryId).toBe("sueldo");
  });

  it("sin comercio o sin coincidencia devuelve null", () => {
    expect(matchRule("", "expense", rules)).toBeNull();
    expect(matchRule(null, "expense", rules)).toBeNull();
    expect(matchRule("Farmacia", "expense", rules)).toBeNull();
  });
});
