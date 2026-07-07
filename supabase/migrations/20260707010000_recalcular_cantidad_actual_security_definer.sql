-- Fix: recalcular_cantidad_actual (herramientas) necesita SECURITY DEFINER.
--
-- Mismo bug ya corregido para materiales en 20260705010000, aplicado ahora al
-- lado de herramientas: la función es llamada desde el trigger AFTER INSERT/DELETE
-- de `movimientos`. Cuando el usuario autenticado es un worker, la política
-- "admin update inventario_obra" bloquea en silencio el UPDATE interior
-- (0 filas afectadas, sin error), dejando `cantidad_actual` desactualizada tras
-- cualquier traslado que registre un worker — hasta que un admin haga otra
-- operación sobre esa misma combinación herramienta+obra y la recalcule bien.
--
-- SECURITY DEFINER ejecuta la función con los permisos del owner (postgres),
-- igual al patrón ya usado en recalcular_cantidad_actual_material, auth_role()
-- y sync_role_to_jwt(). La función solo puede recalcular cantidad_actual desde
-- los movimientos reales — no abre escritura arbitraria. Se conserva el guard
-- de cantidades negativas agregado en 20260707000000.

create or replace function recalcular_cantidad_actual(p_inventario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inicial   integer;
  v_entradas  integer;
  v_salidas   integer;
  v_resultado integer;
begin
  if p_inventario_id is null then return; end if;

  select cantidad_inicial into v_inicial
  from inventario_obra where id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_entradas
  from movimientos where inventario_destino_id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_salidas
  from movimientos where inventario_origen_id = p_inventario_id;

  v_resultado := v_inicial + v_entradas - v_salidas;

  if v_resultado < 0 then
    raise exception 'No se puede completar esta operación: el inventario quedaría en % unidades (negativo). Revisa el orden de los movimientos relacionados con este registro.', v_resultado;
  end if;

  update inventario_obra
  set cantidad_actual = v_resultado
  where id = p_inventario_id;
end;
$$;

-- Recalcular todos los registros existentes: si algún worker registró traslados
-- de herramientas desde el 2026-06-30 (cuando se introdujo la política RLS que
-- causaba el bug), su cantidad_actual pudo quedar desactualizada. Este bloque
-- la corrige retroactivamente para todos los registros de inventario_obra.
do $$
declare
  r record;
begin
  for r in select id from inventario_obra loop
    perform recalcular_cantidad_actual(r.id);
  end loop;
end;
$$;
