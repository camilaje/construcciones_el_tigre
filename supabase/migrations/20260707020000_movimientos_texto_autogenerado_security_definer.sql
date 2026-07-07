-- Fix: movimientos_after_insert necesita SECURITY DEFINER para poder escribir
-- texto_autogenerado; y backfill de los registros que quedaron en NULL.
--
-- Causa raíz: la tabla `movimientos` no tiene NINGUNA política de UPDATE desde
-- que se introdujo RLS granular (20260630050000_roles.sql) — la política
-- "authenticated full access" original (que cubría todo, incluido UPDATE) se
-- borró y se reemplazó solo con SELECT/INSERT/DELETE, porque por diseño los
-- movimientos son de solo creación + eliminación, nunca edición manual. El
-- problema es que el propio trigger `movimientos_after_insert` SÍ necesita
-- escribir `texto_autogenerado` justo después de insertar, y como la función
-- corre con los permisos del que hizo el INSERT (no es SECURITY DEFINER), ese
-- UPDATE interno también queda bloqueado — para CUALQUIER rol, admin incluido.
--
-- La solución NO es agregar una política de UPDATE (eso permitiría editar
-- movimientos libremente desde el cliente, violando la regla de negocio). La
-- solución es que el trigger corra con privilegios elevados (SECURITY DEFINER)
-- solo para esa escritura interna puntual — igual que recalcular_cantidad_actual.

create or replace function movimientos_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_obra_origen              text;
  v_obra_destino             text;
  v_cantidad_resultante_origen integer;
begin
  if new.inventario_origen_id is not null then
    perform recalcular_cantidad_actual(new.inventario_origen_id);
  end if;
  if new.inventario_destino_id is not null then
    perform recalcular_cantidad_actual(new.inventario_destino_id);
  end if;

  if new.tipo = 'compra' then
    select o.nombre into v_obra_destino
    from inventario_obra i join obras o on o.id = i.obra_id
    where i.id = new.inventario_destino_id;

    update movimientos
    set texto_autogenerado =
      'Ingresaron ' || new.cantidad || ' por compra a ' || v_obra_destino ||
      ' el ' || to_char(new.fecha, 'DD/MM/YYYY')
    where id = new.id;

  elsif new.tipo = 'baja' then
    select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
    from inventario_obra i join obras o on o.id = i.obra_id
    where i.id = new.inventario_origen_id;

    update movimientos
    set texto_autogenerado =
      'Se dieron de baja ' || new.cantidad || ' de ' || v_obra_origen ||
      ' el ' || to_char(new.fecha, 'DD/MM/YYYY') ||
      ' - Quedan ' || v_cantidad_resultante_origen || ' en ' || v_obra_origen
    where id = new.id;

  else
    select o.nombre into v_obra_destino
    from inventario_obra i join obras o on o.id = i.obra_id
    where i.id = new.inventario_destino_id;

    select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
    from inventario_obra i join obras o on o.id = i.obra_id
    where i.id = new.inventario_origen_id;

    update movimientos
    set texto_autogenerado =
      'Salieron ' || new.cantidad || ' hacia ' || v_obra_destino ||
      ' el ' || to_char(new.fecha, 'DD/MM/YYYY') ||
      ' - Quedaron ' || v_cantidad_resultante_origen || ' en ' || v_obra_origen
    where id = new.id;
  end if;

  return new;
end;
$$;

-- ─── Backfill: regenerar texto_autogenerado para registros que quedaron NULL ──
-- Nota de exactitud: para movimientos viejos, "quedaron/quedan X" se calcula
-- con la cantidad_actual de HOY (ya corregida por el fix anterior), no con la
-- cantidad que existía justo en el momento histórico de ese movimiento. Es una
-- limitación aceptada — texto_autogenerado es solo informativo/descriptivo, no
-- se usa en ningún cálculo de negocio; reconstruir el valor histórico exacto
-- movimiento por movimiento no se justifica para un texto decorativo.

do $$
declare
  r record;
  v_obra_origen  text;
  v_obra_destino text;
  v_cantidad_resultante_origen integer;
begin
  for r in select * from movimientos where texto_autogenerado is null loop
    if r.tipo = 'compra' then
      select o.nombre into v_obra_destino
      from inventario_obra i join obras o on o.id = i.obra_id
      where i.id = r.inventario_destino_id;

      update movimientos
      set texto_autogenerado =
        'Ingresaron ' || r.cantidad || ' por compra a ' || coalesce(v_obra_destino, '(obra desconocida)') ||
        ' el ' || to_char(r.fecha, 'DD/MM/YYYY')
      where id = r.id;

    elsif r.tipo = 'baja' then
      select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
      from inventario_obra i join obras o on o.id = i.obra_id
      where i.id = r.inventario_origen_id;

      update movimientos
      set texto_autogenerado =
        'Se dieron de baja ' || r.cantidad || ' de ' || coalesce(v_obra_origen, '(obra desconocida)') ||
        ' el ' || to_char(r.fecha, 'DD/MM/YYYY') ||
        ' - Quedan ' || coalesce(v_cantidad_resultante_origen, 0) || ' en ' || coalesce(v_obra_origen, '(obra desconocida)')
      where id = r.id;

    else
      select o.nombre into v_obra_destino
      from inventario_obra i join obras o on o.id = i.obra_id
      where i.id = r.inventario_destino_id;

      select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
      from inventario_obra i join obras o on o.id = i.obra_id
      where i.id = r.inventario_origen_id;

      update movimientos
      set texto_autogenerado =
        'Salieron ' || r.cantidad || ' hacia ' || coalesce(v_obra_destino, '(obra desconocida)') ||
        ' el ' || to_char(r.fecha, 'DD/MM/YYYY') ||
        ' - Quedaron ' || coalesce(v_cantidad_resultante_origen, 0) || ' en ' || coalesce(v_obra_origen, '(obra desconocida)')
      where id = r.id;
    end if;
  end loop;
end;
$$;
