import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL: connection string de Supabase con el "Transaction pooler"
// (puerto 6543) para runtime serverless; usar el puerto directo (5432)
// solo para correr migraciones (ver drizzle.config.ts y package.json).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Falta DATABASE_URL. Copia .env.local.example a .env.local y completa las credenciales de tu proyecto Supabase.",
  );
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

/**
 * Cliente postgres.js crudo, para transacciones que Drizzle no expresa bien
 * (p. ej. restaurar un respaldo con tablas y columnas dinamicas). Conecta
 * con el rol dueno de la base: SALTA Row Level Security, asi que quien lo
 * use debe acotar TODO por household_id a mano.
 */
export const sqlClient = client;
