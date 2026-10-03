import { defineConfig } from "vitest/config";
import path from "node:path";

// Pruebas que hablan con la base real (ver src/db/rls.integration.test.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Fuera de Next, `server-only` lanza al importarse.
      "server-only": path.resolve(__dirname, "./src/test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
