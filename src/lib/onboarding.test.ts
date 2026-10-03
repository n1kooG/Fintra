import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PRESETS,
  SUGGESTED_CATEGORIES,
  newCategoryNames,
  normalizeName,
} from "./onboarding";

describe("normalizeName", () => {
  it("ignora tildes, mayusculas y espacios de los bordes", () => {
    expect(normalizeName("  Educación ")).toBe("educacion");
  });
});

describe("newCategoryNames", () => {
  it("omite las que ya existen, sin importar tildes ni mayusculas", () => {
    expect(newCategoryNames(["Educacion", "Otros"], ["Educación", "Mascotas"])).toEqual([
      "Mascotas",
    ]);
  });

  it("quita repetidas entre las elegidas", () => {
    expect(newCategoryNames([], ["Ropa", "ropa", "ROPA"])).toEqual(["Ropa"]);
  });

  it("ignora vacias y compacta espacios", () => {
    expect(newCategoryNames([], ["  ", "Auto   y  bencina"])).toEqual(["Auto y bencina"]);
  });

  it("no inventa nada si no se eligio nada", () => {
    expect(newCategoryNames(["Otros"], [])).toEqual([]);
  });
});

describe("catalogos", () => {
  it("los tipos de cuenta del asistente existen en el esquema", () => {
    const valid = ["cash", "checking", "savings", "credit_card", "investment", "loan"];
    for (const preset of ACCOUNT_PRESETS) expect(valid).toContain(preset.type);
  });

  it("los ids de preset son unicos", () => {
    const ids = ACCOUNT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("las categorias sugeridas no se repiten", () => {
    const keys = SUGGESTED_CATEGORIES.map(normalizeName);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
