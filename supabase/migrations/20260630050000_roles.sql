-- ============================================================
-- Roles: user_profiles, sincronización JWT, RLS granular
-- ============================================================

-- 1. Tabla de perfiles con rol
create table user_profiles (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  role         text        not null check (role in ('super_admin', 'admin', 'worker')),
  display_name text,
  email        text,
  created_at   timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- Todos los autenticados pueden leer (la UI de gestión de usuarios lo necesita)
create policy "authenticated can read user_profiles"
  on user_profiles for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE solo via Edge Function (service_role bypasses RLS);
-- bloqueamos acceso directo desde el cliente anon/authenticated
create policy "block direct insert on user_profiles"
  on user_profiles for insert to authenticated with check (false);

create policy "block direct update on user_profiles"
  on user_profiles for update to authenticated using (false);

create policy "block direct delete on user_profiles"
  on user_profiles for delete to authenticated using (false);


-- 2. Función auxiliar: devuelve el rol del usuario actual.
--    Intenta el claim del JWT primero (rápido, sin query extra);
--    si no existe aún (ej. primer login tras la migración), cae al DB.
create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif((auth.jwt() -> 'app_metadata' ->> 'role'), ''),
    (select role from user_profiles where user_id = auth.uid()),
    'worker'
  )
$$;


-- 3. Trigger: al insertar o cambiar el rol en user_profiles,
--    actualiza raw_app_meta_data en auth.users para que el próximo JWT
--    incluya el claim { role: '...' }
create or replace function sync_role_to_jwt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role)
  where id = new.user_id;
  return new;
end;
$$;

create trigger user_profiles_sync_jwt
  after insert or update of role
  on user_profiles
  for each row
  execute function sync_role_to_jwt();


-- 4. Alta de usuarios existentes
insert into user_profiles (user_id, role, display_name, email)
select id, 'super_admin', 'Juan Camilo', email
from auth.users
where email = 'garciamorenojuancamilo526@gmail.com'
on conflict (user_id) do update set role = 'super_admin';

insert into user_profiles (user_id, role, display_name, email)
select id, 'admin', 'Paula', email
from auth.users
where email = 'paula.benjumeagrisa@gmail.com'
on conflict (user_id) do update set role = 'admin';


-- 5. Reemplazar las políticas existentes (all-permissive) por políticas granulares.
--    Primero borramos todo lo que haya en las 8 tablas operativas.
do $$ declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'herramientas', 'materiales', 'obras', 'encargados',
        'inventario_obra', 'inventario_material',
        'movimientos', 'movimientos_material'
      )
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Catálogos: todos pueden SELECT e INSERT; solo admin/super_admin pueden UPDATE y DELETE
create policy "all select herramientas"   on herramientas for select to authenticated using (true);
create policy "all insert herramientas"   on herramientas for insert to authenticated with check (true);
create policy "admin update herramientas" on herramientas for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete herramientas" on herramientas for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

create policy "all select materiales"   on materiales for select to authenticated using (true);
create policy "all insert materiales"   on materiales for insert to authenticated with check (true);
create policy "admin update materiales" on materiales for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete materiales" on materiales for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

create policy "all select obras"   on obras for select to authenticated using (true);
create policy "all insert obras"   on obras for insert to authenticated with check (true);
create policy "admin update obras" on obras for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete obras" on obras for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

create policy "all select encargados"   on encargados for select to authenticated using (true);
create policy "all insert encargados"   on encargados for insert to authenticated with check (true);
create policy "admin update encargados" on encargados for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete encargados" on encargados for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

-- Inventarios: todos pueden SELECT e INSERT (alta inicial); solo admin/super_admin pueden UPDATE y DELETE
create policy "all select inventario_obra"   on inventario_obra for select to authenticated using (true);
create policy "all insert inventario_obra"   on inventario_obra for insert to authenticated with check (true);
create policy "admin update inventario_obra" on inventario_obra for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete inventario_obra" on inventario_obra for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

create policy "all select inventario_material"   on inventario_material for select to authenticated using (true);
create policy "all insert inventario_material"   on inventario_material for insert to authenticated with check (true);
create policy "admin update inventario_material" on inventario_material for update to authenticated using (auth_role() in ('admin', 'super_admin'));
create policy "admin delete inventario_material" on inventario_material for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

-- Movimientos: todos pueden SELECT e INSERT; solo admin/super_admin pueden DELETE
create policy "all select movimientos"   on movimientos for select to authenticated using (true);
create policy "all insert movimientos"   on movimientos for insert to authenticated with check (true);
create policy "admin delete movimientos" on movimientos for delete to authenticated using (auth_role() in ('admin', 'super_admin'));

create policy "all select movimientos_material"   on movimientos_material for select to authenticated using (true);
create policy "all insert movimientos_material"   on movimientos_material for insert to authenticated with check (true);
create policy "admin delete movimientos_material" on movimientos_material for delete to authenticated using (auth_role() in ('admin', 'super_admin'));
