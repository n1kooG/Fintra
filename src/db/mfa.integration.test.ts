/**
 * Candado de la verificacion en dos pasos en la base de datos.
 *
 * `my_household_ids()` (supabase/policies.sql) no entrega ningun household a
 * quien tiene un factor verificado y una sesion aal1; todas las politicas de
 * negocio pasan por esa funcion. Aqui se comprueba contra la base real, dentro
 * de una transaccion que termina en ROLLBACK (no queda nada): primero se
 * instala la version de la funcion que esta en policies.sql (el DDL tambien
 * se revierte, asi que la prueba vale antes y despues de aplicarla de verdad)
 * y luego se consulta como el rol `authenticated` con cada nivel de sesion.
 *
 * Se corre con `npm run test:rls`.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";

config({ path: ".env.local" });

const url = process.env.RLS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

class Rollback extends Error {}
type Tx = TransactionSql;

/** La definicion de my_household_ids() tal como esta en policies.sql (una sola fuente de verdad). */
function functionFromPolicies(): string {
  const sql = readFileSync("supabase/policies.sql", "utf8");
  const match = sql.match(
    /create or replace function public\.my_household_ids\(\)[\s\S]*?\$\$;/,
  );
  if (!match) throw new Error("No encontre my_household_ids() en supabase/policies.sql");
  return match[0];
}

async function actAs(tx: Tx, userId: string, aal: "aal1" | "aal2") {
  await tx`reset role`;
  const claims = JSON.stringify({ sub: userId, role: "authenticated", aal });
  await tx`select set_config('request.jwt.claims', ${claims}, true)`;
  await tx`set local role authenticated`;
}

async function attempt(tx: Tx, fn: (sp: Tx) => Promise<unknown>) {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
    return "ok" as const;
  } catch (e) {
    return { code: (e as { code?: string }).code };
  }
}

type Report = {
  /** categorias visibles (sembradas por el trigger) segun usuario y nivel de sesion. */
  noFactorAal1: number;
  unverifiedFactorAal1: number;
  verifiedAal1: number;
  verifiedAal2: number;
  verifiedAal1Insert: Awaited<ReturnType<typeof attempt>>;
  verifiedAal1Members: number;
  verifiedAal2Insert: Awaited<ReturnType<typeof attempt>>;
};

async function scenario(tx: Tx): Promise<Report> {
  await tx.unsafe(functionFromPolicies());

  const plain = crypto.randomUUID(); // sin factores
  const half = crypto.randomUUID(); // enrolamiento sin terminar
  const secured = crypto.randomUUID(); // con factor verificado
  await tx`insert into auth.users (id, email, raw_user_meta_data) values
    (${plain}, ${`mfa-plain-${plain}@test.invalid`}, '{"full_name":"Sin 2FA"}'),
    (${half}, ${`mfa-half-${half}@test.invalid`}, '{"full_name":"A medias"}'),
    (${secured}, ${`mfa-sec-${secured}@test.invalid`}, '{"full_name":"Con 2FA"}')`;

  await tx`insert into auth.mfa_factors
      (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values
      (${crypto.randomUUID()}, ${half}, 'a medias', 'totp', 'unverified', now(), now(), 'x'),
      (${crypto.randomUUID()}, ${secured}, 'verificado', 'totp', 'verified', now(), now(), 'x')`;

  const [{ household_id: securedHousehold }] = await tx<{ household_id: string }[]>`
    select household_id from household_members where user_id = ${secured}`;

  const visible = async (userId: string, aal: "aal1" | "aal2") => {
    await actAs(tx, userId, aal);
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from categories`;
    return n;
  };

  const report: Report = {
    noFactorAal1: await visible(plain, "aal1"),
    unverifiedFactorAal1: await visible(half, "aal1"),
    verifiedAal1: await visible(secured, "aal1"),
    verifiedAal2: await visible(secured, "aal2"),
    verifiedAal1Insert: "ok",
    verifiedAal1Members: -1,
    verifiedAal2Insert: "ok",
  };

  // Escribir como aal1 tampoco: la politica de insert pasa por la misma funcion.
  await actAs(tx, secured, "aal1");
  report.verifiedAal1Insert = await attempt(
    tx,
    (sp) =>
      sp`insert into accounts (household_id, name, type) values (${securedHousehold}, 'Cuenta', 'checking')`,
  );
  const [{ n: members }] = await tx<{ n: number }[]>`
    select count(*)::int as n from household_members`;
  report.verifiedAal1Members = members;

  await actAs(tx, secured, "aal2");
  report.verifiedAal2Insert = await attempt(
    tx,
    (sp) =>
      sp`insert into accounts (household_id, name, type) values (${securedHousehold}, 'Cuenta', 'checking')`,
  );
  return report;
}

describe.skipIf(!url)(
  "candado de la verificacion en dos pasos (my_household_ids)",
  () => {
    let report: Report;
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = postgres(url!, { max: 1, prepare: false });
      try {
        await sql.begin(async (tx) => {
          report = await scenario(tx);
          throw new Rollback();
        });
      } catch (e) {
        if (!(e instanceof Rollback)) throw e;
      }
    }, 60_000);

    afterAll(async () => {
      await sql?.end();
    });

    it("sin verificacion activada todo sigue igual (ve su hogar con sesion aal1)", () => {
      expect(report.noFactorAal1).toBeGreaterThan(0);
    });

    it("un enrolamiento a medias (factor sin verificar) no bloquea nada", () => {
      expect(report.unverifiedFactorAal1).toBeGreaterThan(0);
    });

    it("con un factor verificado y sesion aal1 no ve nada", () => {
      expect(report.verifiedAal1).toBe(0);
      expect(report.verifiedAal1Members).toBe(0);
    });

    it("con un factor verificado y sesion aal1 tampoco puede escribir", () => {
      expect(report.verifiedAal1Insert).toEqual({ code: "42501" });
    });

    it("al completar el segundo paso (aal2) ve y escribe como siempre", () => {
      expect(report.verifiedAal2).toBeGreaterThan(0);
      expect(report.verifiedAal2Insert).toBe("ok");
    });
  },
);
