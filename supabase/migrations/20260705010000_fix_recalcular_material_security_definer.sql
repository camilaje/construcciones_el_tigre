-- Fix: recalcular_cantidad_actual_material necesita SECURITY DEFINER.
--
-- La función es llamada desde triggers AFTER INSERT/DELETE en inventario_material
-- y movimientos_material. Cuando el usuario autenticado es un worker, la política
-- "admin update inventario_material" bloquea silenciosamente el UPDATE interior,
-- dejando cantidad_actual = 0. La vista resumen_por_obra_material filtra con
-- WHERE cantidad_actual > 0, haciendo el registro invisible pese al toast de éxito.
--
-- SECURITY DEFINER ejecuta la función con los permisos del owner (postgres),
-- igual al patrón ya usado en auth_role() y sync_role_to_jwt().
-- La función solo puede recalcular cantidad_actual desde los movimientos reales
-- — no abre escritura arbitraria.

create or replace function recalcular_cantidad_actual_material(p_inventario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_inventario_id is null then return; end if;

  update inventario_material
  set cantidad_actual =
    cantidad_inicial
    + coalesce((
        select sum(cantidad) from movimientos_material
        where inventario_destino_id = p_inventario_id
      ), 0)
    - coalesce((
        select sum(cantidad) from movimientos_material
        where inventario_origen_id = p_inventario_id
      ), 0)
  where id = p_inventario_id;
end;
$$;

-- Recalcular todos los registros existentes para corregir los que quedaron
-- con cantidad_actual incorrecta por el bug de RLS.
do $$
declare
  r record;
begin
  for r in select id from inventario_material loop
    perform recalcular_cantidad_actual_material(r.id);
  end loop;
end;
$$;
