-- Fintra — Row Level Security
-- Correr en el SQL Editor de Supabase DESPUES de aplicar las migraciones
-- de Drizzle (npm run db:migrate), que crean las tablas en el schema
-- "public". Este archivo solo agrega seguridad; no crea tablas.
--
-- Es seguro volver a correrlo entero las veces que haga falta: cada
-- politica se borra primero (si existia) y se vuelve a crear.

-- ============================================================
-- 1) Helper: households a los que pertenece el usuario autenticado
-- ============================================================
-- Verificacion en dos pasos: si la persona tiene un factor verificado (auth.mfa_factors)
-- y su sesion todavia no subio a aal2, no se le entrega ningun household, o sea que las
-- politicas de abajo (todas pasan por esta funcion) no le muestran ni dejan escribir nada.
-- Sin este candado, quien tenga solo la contrasena podria hablar directo con la API de
-- Supabase y saltarse la pantalla /verificar. Quien no activo la verificacion no cambia.
create or replace function public.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from household_members m
  where m.user_id = auth.uid()
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') in ('aal2', 'aal3')
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = auth.uid()
          and f.status = 'verified'
      )
    )
$$;

-- ============================================================
-- 2) Activar RLS en todas las tablas de negocio
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table transfers enable row level security;
alter table tags enable row level security;
alter table transaction_tags enable row level security;
alter table exchange_rates enable row level security;
alter table recurring_rules enable row level security;
alter table categorization_rules enable row level security;
alter table budgets enable row level security;
alter table budget_totals enable row level security;
alter table goals enable row level security;
alter table goal_contributions enable row level security;
alter table installment_plans enable row level security;
alter table loans enable row level security;
alter table loan_prepayments enable row level security;
alter table personal_debts enable row level security;
alter table holdings enable row level security;
alter table holding_flows enable row level security;
alter table holding_valuations enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_log enable row level security;
alter table household_invitations enable row level security;

-- ============================================================
-- 3) Politicas: leer/escribir solo lo del propio household
-- ============================================================

-- households: se lee si sos miembro; se crea via trigger (abajo), no
-- directamente desde el cliente.
drop policy if exists "select_own_household" on households;
create policy "select_own_household" on households
  for select using (id in (select my_household_ids()));

-- household_members: cada quien ve los miembros de sus propios households.
drop policy if exists "select_own_household_members" on household_members;
create policy "select_own_household_members" on household_members
  for select using (household_id in (select my_household_ids()));

-- profiles: se lee el propio perfil y el de quienes comparten household.
drop policy if exists "select_household_profiles" on profiles;
create policy "select_household_profiles" on profiles
  for select using (household_id in (select my_household_ids()));
drop policy if exists "update_own_profile" on profiles;
create policy "update_own_profile" on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and household_id in (select my_household_ids()));

-- Tablas de negocio: mismo patron CRUD en todas las que tienen household_id.
-- exchange_rates queda afuera del bucle: es un catalogo compartido sin esa
-- columna, y recibe su propia politica de solo lectura mas abajo.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','transfers','tags',
    'recurring_rules','categorization_rules',
    'budgets','budget_totals','goals','goal_contributions',
    'installment_plans','loans','loan_prepayments','personal_debts',
    'holdings','holding_flows','holding_valuations'
  ] loop
    execute format($f$
      drop policy if exists "select_own_%1$s" on %1$s;
      create policy "select_own_%1$s" on %1$s
        for select using (household_id in (select my_household_ids()));

      drop policy if exists "insert_own_%1$s" on %1$s;
      create policy "insert_own_%1$s" on %1$s
        for insert with check (household_id in (select my_household_ids()));

      drop policy if exists "update_own_%1$s" on %1$s;
      create policy "update_own_%1$s" on %1$s
        for update using (household_id in (select my_household_ids()));

      drop policy if exists "delete_own_%1$s" on %1$s;
      create policy "delete_own_%1$s" on %1$s
        for delete using (household_id in (select my_household_ids()));
    $f$, t);
  end loop;
end $$;

-- push_subscriptions: el endpoint de un dispositivo permite enviarle avisos, asi
-- que solo lo ve y lo gestiona su dueno (no basta con ser del mismo household).
drop policy if exists "own_push_subscriptions" on push_subscriptions;
create policy "own_push_subscriptions" on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id in (select my_household_ids()));

-- notification_log: sin politicas a proposito. Con RLS activo y ninguna politica, los
-- usuarios no ven ni escriben nada; solo el cron (service role, que salta RLS).

-- household_invitations: sin politicas a proposito. Guarda el hash del token de cada
-- invitacion; solo el servidor la lee y escribe (rol dueno), despues de comprobar que
-- quien pide es el propietario del espacio o el dueno del correo invitado.

-- exchange_rates es catalogo compartido (no tiene household_id): visible
-- para cualquier usuario autenticado, de solo lectura desde el cliente
-- (el cron de sincronizacion usa la service role key, que salta RLS, asi
-- que no hace falta una politica de insert/update/delete aca).
drop policy if exists "select_exchange_rates" on exchange_rates;
create policy "select_exchange_rates" on exchange_rates
  for select using (auth.role() = 'authenticated');

-- transaction_tags no tiene household_id propio: hereda el permiso de la
-- transaccion a la que pertenece.
drop policy if exists "select_own_transaction_tags" on transaction_tags;
create policy "select_own_transaction_tags" on transaction_tags
  for select using (
    transaction_id in (
      select id from transactions where household_id in (select my_household_ids())
    )
  );
drop policy if exists "insert_own_transaction_tags" on transaction_tags;
create policy "insert_own_transaction_tags" on transaction_tags
  for insert with check (
    transaction_id in (
      select id from transactions where household_id in (select my_household_ids())
    )
  );
drop policy if exists "delete_own_transaction_tags" on transaction_tags;
create policy "delete_own_transaction_tags" on transaction_tags
  for delete using (
    transaction_id in (
      select id from transactions where household_id in (select my_household_ids())
    )
  );

-- ============================================================
-- 4) Categorias chilenas precargadas — funcion reutilizable
-- ============================================================
-- La llama el trigger de alta (household nuevo) y tambien el bloque
-- de backfill de abajo (household existente sin categorias todavia).
create or replace function public.seed_default_categories(target_household_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into categories (household_id, name, kind, sort_order)
  values
    (target_household_id, 'Sueldo', 'income', 0),
    (target_household_id, 'Otros ingresos', 'income', 1),
    (target_household_id, 'Supermercado', 'expense', 0),
    (target_household_id, 'Arriendo', 'expense', 1),
    (target_household_id, 'Transporte', 'expense', 2),
    (target_household_id, 'Restaurantes', 'expense', 3),
    (target_household_id, 'Servicios', 'expense', 4),
    (target_household_id, 'Salud', 'expense', 5),
    (target_household_id, 'Entretenimiento', 'expense', 6),
    (target_household_id, 'Otros', 'expense', 7)
$$;

-- ============================================================
-- 5) Trigger: al registrarse, crear household + profile + membership
--    + categorias por defecto
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into households (name)
  values (coalesce(new.raw_user_meta_data ->> 'full_name', 'Mi espacio') || ' — Fintra')
  returning id into new_household_id;

  insert into household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  insert into profiles (id, household_id, display_name, avatar_url)
  values (
    new.id,
    new_household_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  perform public.seed_default_categories(new_household_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6) Backfill: households que ya existian antes de este cambio y
--    todavia no tienen categorias (por ejemplo, el household creado
--    la primera vez que corriste este archivo, antes de esta seccion)
-- ============================================================
do $$
declare
  h record;
begin
  for h in
    select id from households
    where not exists (select 1 from categories where categories.household_id = households.id)
  loop
    perform public.seed_default_categories(h.id);
  end loop;
end $$;
