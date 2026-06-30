-- Autenticación por nombre de usuario en lugar de correo electrónico

-- 1. Renombrar columna email → username
alter table perfiles_usuario rename column email to username;

-- 2. Restricción de unicidad en username
alter table perfiles_usuario add constraint perfiles_usuario_username_key unique (username);

-- 3. Para usuarios ya existentes, asignar display_name como username
--    (los valores actuales son emails reales que ya no corresponden)
update perfiles_usuario
set username = display_name
where username like '%@%' and display_name is not null;

-- 4. Sincronizar full_name en user_metadata para que el shell muestre el nombre correcto
update auth.users
set raw_user_meta_data =
  coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', p.username)
from perfiles_usuario p
where auth.users.id = p.user_id;

-- 5. Función pública para resolver el email interno desde el username
--    (el login llama a esta función antes de signInWithPassword)
create or replace function get_auth_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  join perfiles_usuario p on p.user_id = u.id
  where p.username = p_username
  limit 1;
$$;
