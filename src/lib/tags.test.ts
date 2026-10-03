import { describe, expect, it } from "vitest";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_TRANSACTION,
  cleanTagName,
  parseTagNames,
  tagKey,
} from "./tags";

describe("cleanTagName", () => {
  it("quita el # y compacta espacios", () => {
    expect(cleanTagName("  #viaje   Bariloche ")).toBe("viaje Bariloche");
    expect(cleanTagName("##regalos")).toBe("regalos");
  });

  it("corta al maximo", () => {
    expect(cleanTagName("x".repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });

  it("devuelve vacio si no queda nada", () => {
    expect(cleanTagName("  # ")).toBe("");
  });
});

describe("tagKey", () => {
  it("no distingue mayusculas ni tildes", () => {
    expect(tagKey("Viaje")).toBe(tagKey("#viáje"));
  });
});

describe("parseTagNames", () => {
  it("separa por comas, punto y coma y saltos de linea", () => {
    expect(parseTagNames("viaje, regalos; navidad\ncumple")).toEqual([
      "viaje",
      "regalos",
      "navidad",
      "cumple",
    ]);
  });

  it("descarta vacias y repetidas, conservando la primera escrita", () => {
    expect(parseTagNames("Viaje, , viaje, #VIAJE, Regalos")).toEqual([
      "Viaje",
      "Regalos",
    ]);
  });

  it("acepta una lista", () => {
    expect(parseTagNames(["a", "b", "A"])).toEqual(["a", "b"]);
  });

  it("limita la cantidad por movimiento", () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(",");
    expect(parseTagNames(many)).toHaveLength(MAX_TAGS_PER_TRANSACTION);
  });

  it("un texto vacio no produce etiquetas", () => {
    expect(parseTagNames("")).toEqual([]);
    expect(parseTagNames(" , ,")).toEqual([]);
  });
});
