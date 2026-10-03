import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// Smoke test: confirma que Vitest y los alias @/ quedan bien configurados
// desde la Fase 0. La suite real (money.ts, fx.ts, recurrence.ts...)
// se agrega a medida que esos modulos se construyen en cada fase.
describe("cn", () => {
  it("combina clases de Tailwind sin duplicar", () => {
    expect(cn("px-2", "px-2", "text-sm")).toBe("px-2 text-sm");
  });
});
