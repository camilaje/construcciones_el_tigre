-- Renombrar user_profiles → perfiles_usuario para consistencia con nomenclatura en español

alter table user_profiles rename to perfiles_usuario;

-- Actualizar auth_role() para referenciar el nuevo nombre de tabla
create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif((auth.jwt() -> 'app_metadata' ->> 'role'), ''),
    (select role from perfiles_usuario where user_id = auth.uid()),
    'worker'
  )
$$;
