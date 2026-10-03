import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// dotenv/config por si solo solo lee ".env" — Next.js usa ".env.local"
// para las variables locales, asi que hay que apuntarlo a mano.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase Auth y Storage viven en sus propios schemas — solo nos
  // interesa versionar "public", donde viven nuestras tablas.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
