-- Baja de herramientas dañadas y consumo de materiales en obra.
-- Extiende el tipo de movimiento: baja (herramientas) y consumo (materiales).

-- ─── HERRAMIENTAS ─────────────────────────────────────────────────────────────

-- 1. Extender CHECK de tipo: traslado | compra | baja
alter table movimientos drop constraint movimientos_tipo_check;
alter table movimientos add constraint movimientos_tipo_check
  check (tipo in ('traslado', 'compra', 'baja'));

-- 2. inventario_destino_id puede ser NULL (para bajas la herramienta no va a ningún lado)
alter table movimientos alter column inventario_destino_id drop not null;

-- 3. Columna motivo exclusiva de bajas
alter table movimientos add column motivo text
  check (motivo in ('daño', 'pérdida', 'obsolescencia'));

-- 4. Trigger after-insert: nuevo branch para texto de baja;
--    también agrega null-guard en el recalculo del destino
create or replace function movimientos_after_insert() returns trigger
language plpgsql as $$
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

-- 5. Trigger after-delete: revertir cantidad_total cuando se elimina una baja
create or replace function movimientos_after_delete() returns trigger
language plpgsql as $$
begin
  if old.inventario_origen_id is not null then
    perform recalcular_cantidad_actual(old.inventario_origen_id);
  end if;
  if old.inventario_destino_id is not null then
    perform recalcular_cantidad_actual(old.inventario_destino_id);
  end if;

  if old.tipo = 'compra' then
    update herramientas
    set cantidad_total = cantidad_total - old.cantidad
    from inventario_obra io
    where io.id = old.inventario_destino_id
      and herramientas.id = io.herramienta_id;
  elsif old.tipo = 'baja' then
    update herramientas
    set cantidad_total = cantidad_total + old.cantidad
    from inventario_obra io
    where io.id = old.inventario_origen_id
      and herramientas.id = io.herramienta_id;
  end if;

  return old;
end;
$$;

-- 6. Recrear vista historial_movimientos con columna motivo
drop view if exists historial_movimientos;

create view historial_movimientos with (security_invoker = true) as
select
  m.id,
  m.tipo,
  m.motivo,
  m.cantidad,
  m.fecha,
  m.observaciones,
  m.texto_autogenerado,
  m.created_at,
  h.nombre                        as herramienta,
  oo.nombre                       as obra_origen,
  od.nombre                       as obra_destino,
  qe.nombre                       as quien_entrega,
  qr.nombre                       as quien_recibe
from movimientos m
left join inventario_obra io_origen  on io_origen.id  = m.inventario_origen_id
left join inventario_obra io_destino on io_destino.id = m.inventario_destino_id
left join herramientas h  on h.id  = coalesce(io_origen.herramienta_id, io_destino.herramienta_id)
left join obras oo         on oo.id = io_origen.obra_id
left join obras od         on od.id = io_destino.obra_id
left join encargados qe    on qe.id = m.quien_entrega_id
left join encargados qr    on qr.id = m.quien_recibe_id
order by m.created_at desc;

-- 7. RPC: dar de baja herramienta (admin-only vía roleGuard en el frontend)
create or replace function dar_de_baja_herramienta(
  p_herramienta_id  uuid,
  p_obra_origen_id  uuid,
  p_cantidad        integer,
  p_motivo          text,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql as $$
declare
  v_inventario_origen_id uuid;
  v_stock_actual         integer;
begin
  select id, cantidad_actual
  into v_inventario_origen_id, v_stock_actual
  from inventario_obra
  where herramienta_id = p_herramienta_id and obra_id = p_obra_origen_id;

  if not found then
    raise exception 'No hay inventario de esta herramienta en la obra seleccionada.';
  end if;

  if v_stock_actual < p_cantidad then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_actual, p_cantidad;
  end if;

  update herramientas
  set cantidad_total = cantidad_total - p_cantidad
  where id = p_herramienta_id;

  insert into movimientos (
    inventario_origen_id, inventario_destino_id,
    cantidad, fecha, observaciones, tipo, motivo
  ) values (
    v_inventario_origen_id, null,
    p_cantidad, p_fecha, p_observaciones, 'baja', p_motivo
  );
end;
$$;

-- ─── MATERIALES ───────────────────────────────────────────────────────────────

-- 8. Extender CHECK de tipo: traslado | compra | consumo
alter table movimientos_material drop constraint movimientos_material_tipo_check;
alter table movimientos_material add constraint movimientos_material_tipo_check
  check (tipo in ('traslado', 'compra', 'consumo'));

-- 9. Trigger after-delete: revertir cantidad_total cuando se elimina un consumo
create or replace function movimientos_material_after_delete()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(old.inventario_origen_id);
  perform recalcular_cantidad_actual_material(old.inventario_destino_id);

  if old.tipo = 'compra' then
    update materiales
    set cantidad_total = cantidad_total - old.cantidad
    where id = old.material_id;
  elsif old.tipo = 'consumo' then
    update materiales
    set cantidad_total = cantidad_total + old.cantidad
    where id = old.material_id;
  end if;

  return old;
end;
$$;

-- 10. RPC: registrar consumo de material
-- SECURITY DEFINER: workers pueden usarla pero la RLS bloquea UPDATE en materiales
-- para el rol authenticated; esta función corre con permisos del owner (postgres).
create or replace function registrar_consumo_material(
  p_material_id     uuid,
  p_obra_origen_id  uuid,
  p_cantidad        integer,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_inventario_origen_id uuid;
  v_stock_actual         integer;
begin
  select id, cantidad_actual
  into v_inventario_origen_id, v_stock_actual
  from inventario_material
  where material_id = p_material_id and obra_id = p_obra_origen_id;

  if not found then
    raise exception 'No hay inventario de este material en la obra seleccionada.';
  end if;

  if v_stock_actual < p_cantidad then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_actual, p_cantidad;
  end if;

  update materiales
  set cantidad_total = cantidad_total - p_cantidad
  where id = p_material_id;

  insert into movimientos_material (
    material_id, inventario_origen_id, inventario_destino_id,
    cantidad, fecha, observaciones, tipo
  ) values (
    p_material_id, v_inventario_origen_id, null,
    p_cantidad, p_fecha, p_observaciones, 'consumo'
  );
end;
$$;
