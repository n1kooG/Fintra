# Fintra — Gestor de finanzas personales

App de finanzas personales para Chile (PC y celular): cuentas, movimientos,
presupuestos, tarjetas y préstamos, inversiones, reportes y calendario
financiero. Next.js 16 (App Router) + Supabase (Postgres + Auth) + Drizzle ORM

- Tailwind v4 + shadcn/ui.

## Qué hace

- **Núcleo**: cuentas, categorías y subcategorías, etiquetas, movimientos
  (ingreso, gasto y transferencia, también entre monedas), listado paginado con
  filtros, edición en lote, duplicar, deshacer al eliminar y conciliación de saldo
  con el banco.
- **Multi-moneda**: CLP, USD, EUR, UF y UTM con cotización diaria
  (mindicador.cl) congelada en cada movimiento; todos los totales se ven en la
  moneda que elijas.
- **Recurrentes y reglas**: sueldos y cargos que se generan solos en su fecha, y
  auto-categorización por el nombre del comercio.
- **Presupuestos y metas**: por categoría y tope total del mes, con arrastre del
  sobrante, «disponible por día» y alertas al 80% y 100%.
- **Tarjetas y deudas**: ciclo de facturación, cupo, pago de la tarjeta, compras
  en cuotas, préstamos con tabla de amortización y abonos extraordinarios, y
  deudas entre personas.
- **Inversiones y patrimonio**: valorización manual o automática (dólar/euro/UF,
  depósitos a plazo con interés devengado, criptomonedas con CoinGecko),
  rentabilidad mensual, TIR y rentabilidad real contra la UF, y curva del
  patrimonio neto.
- **Reportes**: comparativa con el mes anterior y con el mismo mes del año
  pasado, tasa de ahorro, gastos fuera de lo habitual, evolución mensual,
  proyección de caja a 6 meses con escenarios, suscripciones y gastos hormiga, y
  calculadora de boletas de honorarios.
- **Salidas**: CSV y Excel (.xlsx) de movimientos, respaldo JSON (y restauración),
  reporte imprimible para guardar como PDF y calendario `.ics` para Google,
  Apple u Outlook.
- **Espacio compartido**: invitar a otra persona por enlace.
- **PWA y avisos push**: instalable en el celular; cada dispositivo elige qué
  avisos recibe (tarjetas, cuotas, depósitos, recurrentes, presupuestos).
- **Seguridad**: aislamiento por hogar con Row Level Security (probado contra la
  base real), verificación en dos pasos opcional (TOTP) que también cierra la
  base de datos hasta completar el segundo paso, CSP con nonce, protección contra
  redirecciones abiertas y verificación de origen en las importaciones.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto en Supabase

Este paso es manual (requiere tu cuenta):

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo (elige una
   región cercana, por ejemplo `sa-east-1`, São Paulo).
2. En **Project Settings → API**, copia `Project URL` y la clave `anon public`.
3. En **Project Settings → API → service_role**, copia esa clave (nunca la
   expongas al navegador).
4. En **Project Settings → Database → Connection string**, copia dos variantes:
   la del **Transaction pooler** (puerto `6543`, para el día a día) y la
   **Direct connection** (puerto `5432`, solo para migraciones).
5. Si quieres login con Google: **Authentication → Providers → Google**, sigue la
   guía de Supabase para crear las credenciales OAuth y pegarlas ahí.

### 3. Completar las variables de entorno

```bash
cp .env.local.example .env.local
```

| Variable                                                             | Para qué sirve                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | Conexión del navegador y del servidor a Supabase                                                           |
| `SUPABASE_SERVICE_ROLE_KEY`                                          | Solo servidor: cron diario y tareas sin sesión de usuario                                                  |
| `DATABASE_URL`                                                       | Postgres (pooler `6543` para ejecutar; directa `5432` solo para migrar)                                    |
| `CRON_SECRET`                                                        | String largo y aleatorio (`openssl rand -hex 32`) que protege `/api/cron/diario`; en local no hace falta   |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Avisos push (`npx web-push generate-vapid-keys`). Sin ellas todo funciona, solo los avisos quedan apagados |
| `NEXT_PUBLIC_CONTACT_EMAIL`                                          | Correo que muestran las páginas de privacidad y términos; si falta, se omite                               |

Las claves VAPID no deben cambiar una vez que hay dispositivos suscritos
(quedarían inválidos). En local, al abrir la app ya se generan los recurrentes
vencidos y se refrescan las cotizaciones; en **Configuración → Cotizaciones** hay
un botón «actualizar ahora».

### 4. Crear las tablas y activar seguridad

```bash
# Antes de este paso, cambia DATABASE_URL en .env.local al puerto 5432
# (direct connection): drizzle-kit no funciona bien contra el pooler.
npm run db:migrate    # aplica las migraciones de src/db/migrations
```

Después, abre el **SQL Editor** de Supabase y corre el contenido de
[`supabase/policies.sql`](supabase/policies.sql): activa Row Level Security en
todas las tablas y crea el trigger que arma tu hogar la primera vez que te
registras. Es idempotente: se vuelve a correr entero cada vez que una migración
agrega tablas o cambia las políticas.

Vuelve a poner `DATABASE_URL` en el puerto `6543` para el día a día. Si cambias el
esquema en `src/db/schema`, `npm run db:generate` crea la migración nueva.

### 5. Correr la app

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), crea tu cuenta desde
`/registro` y confirma el correo (Supabase lo envía automáticamente) para poder
entrar.

### 6. Desplegar en Vercel

1. Sube el repo a GitHub e impórtalo en [vercel.com](https://vercel.com/new).
2. Carga las variables de entorno del paso 3 en **Settings → Environment
   Variables**. `DATABASE_URL` debe ser la del pooler (puerto `6543`).
3. En Supabase, agrega la URL de Vercel a **Authentication → URL Configuration →
   Redirect URLs** (necesario para el login con Google y la confirmación de
   correo en producción). Si usas Google, agrégala también a los orígenes y
   redirecciones autorizados de tu credencial OAuth.
4. El cron diario ([`vercel.json`](vercel.json), 11:00 UTC) sincroniza
   cotizaciones y precios de criptomonedas, genera los recurrentes y envía los
   avisos. Vercel lo activa solo al desplegar; necesita `CRON_SECRET`.
   Además mantiene activo el proyecto de Supabase (el plan gratuito lo pausa tras
   7 días sin uso).

## Scripts

| Comando               | Qué hace                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Servidor de desarrollo                                                                                                                                                                        |
| `npm run build`       | Build de producción                                                                                                                                                                           |
| `npm run lint`        | ESLint                                                                                                                                                                                        |
| `npm run format`      | Prettier (con el plugin de Tailwind)                                                                                                                                                          |
| `npm test`            | Tests unitarios (Vitest), sin red                                                                                                                                                             |
| `npm run test:rls`    | Pruebas contra la base real, siempre dentro de una transacción con rollback (aislamiento entre hogares, restauración de respaldos, invitaciones y el candado de la verificación en dos pasos) |
| `npm run test:e2e`    | Pruebas de punta a punta con Playwright (ver abajo)                                                                                                                                           |
| `npm run db:generate` | Genera migraciones SQL a partir de `src/db/schema`                                                                                                                                            |
| `npm run db:migrate`  | Aplica las migraciones contra la base                                                                                                                                                         |
| `npm run db:studio`   | Abre Drizzle Studio para explorar los datos                                                                                                                                                   |

### Pruebas de punta a punta

```bash
npx playwright install chromium   # una sola vez (o usa E2E_BROWSER_CHANNEL=chrome)
npm run build && npm run test:e2e
```

- `e2e/publico.spec.ts` no necesita credenciales: comprueba que lo privado exige
  sesión, que la API responde 401, el CSP con nonce y que las páginas públicas
  cargan sin errores. Corre también en CI.
- `e2e/sesion.spec.ts` recorre todas las pantallas con sesión y crea una cuenta y
  un gasto. Necesita un **usuario de prueba** (no el tuyo):
  `E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e`. Se omite si faltan.
- Para probar un sitio ya desplegado: `E2E_BASE_URL=https://tu-app.vercel.app`.

## Estructura

```
src/app/(auth)/          Login, registro, recuperar contraseña, verificación en dos pasos
src/app/(app)/           Rutas autenticadas (dashboard, movimientos...)
src/app/auth/callback/   Route handler de OAuth / confirmación de email
src/app/api/             Cron diario, exportaciones (CSV, Excel, .ics, respaldo) e importación
src/components/          Navegación, componentes de dominio y shadcn/ui
src/db/schema/           Esquema de Drizzle, una tabla por archivo
src/db/migrations/       Migraciones SQL versionadas
src/lib/                 Lógica pura con tests: money, fx, recurrence, loans,
                         budgeting, cashflow, analytics, xlsx, ics...
src/lib/supabase/        Clientes de Supabase (browser, server, proxy, admin)
src/proxy.ts             CSP con nonce, refresco de sesión y control de acceso
src/server/              Consultas, Server Actions, sincronización de precios
supabase/policies.sql    Row Level Security + trigger de alta de usuario
e2e/                     Pruebas de Playwright
```

## Límites conocidos

- Los avisos push se probaron en la lógica y el servidor; la entrega de punta a
  punta en un teléfono real depende del navegador y del sistema operativo.
- La verificación en dos pasos no tiene códigos de recuperación: si pierdes la
  aplicación de autenticación, hay que quitar el factor desde el panel de
  Supabase (Authentication → Users).
- El PDF se obtiene imprimiendo el reporte (**Guardar como PDF** en el diálogo del
  navegador), no se genera en el servidor.
- No hay modo sin conexión con datos: sin internet solo se muestra una pantalla
  de aviso (a propósito, para no guardar información financiera en el
  dispositivo).
- Importación de cartolas, OCR de boletas y conexión directa a bancos quedaron
  fuera del alcance a pedido del proyecto.
