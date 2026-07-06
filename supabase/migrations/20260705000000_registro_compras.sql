-- Registro de compras: ingreso de stock nuevo desde proveedor externo.
-- Afecta movimientos (herramientas) y movimientos_material.

-- ─── HERRAMIENTAS ─────────────────────────────────────────────────────────────

-- 1. Columna tipo en movimientos; inventario_origen_id pasa a ser nullable
alter table movimientos
  add column tipo text not null default 'traslado'
    check (tipo in ('traslado', 'compra'));

alter table movimientos
  alter column inventario_origen_id drop not null;

-- 2. NULL guard en recalcular_cantidad_actual (antes no lo tenía)
create or replace function recalcular_cantidad_actual(p_inventario_id uuid)
returns void language plpgsql as $$
declare
  v_inicial integer;
  v_entradas integer;
  v_salidas integer;
begin
  if p_inventario_id is null then return; end if;

  select cantidad_inicial into v_inicial
  from inventario_obra where id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_entradas
  from movimientos where inventario_destino_id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_salidas
  from movimientos where inventario_origen_id = p_inventario_id;

  update inventario_obra
  set cantidad_actual = v_inicial + v_entradas - v_salidas
  where id = p_inventario_id;
end;
$$;

-- 3. Trigger after-insert: maneja NULL origen (compra) y genera texto apropiado
create or replace function movimientos_after_insert() returns trigger
language plpgsql as $$
declare
  v_obra_origen text;
  v_obra_destino text;
  v_cantidad_resultante_origen integer;
begin
  if new.inventario_origen_id is not null then
    perform recalcular_cantidad_actual(new.inventario_origen_id);
  end if;
  perform recalcular_cantidad_actual(new.inventario_destino_id);

  select o.nombre into v_obra_destino
  from inventario_obra i join obras o on o.id = i.obra_id
  where i.id = new.inventario_destino_id;

  if new.tipo = 'compra' then
    update movimientos
    set texto_autogenerado = 'Ingresaron ' || new.cantidad || ' por compra a ' || v_obra_destino ||
      ' el ' || to_char(new.fecha, 'DD/MM/YYYY')
    where id = new.id;
  else
    select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
    from inventario_obra i join obras o on o.id = i.obra_id
    where i.id = new.inventario_origen_id;

    update movimientos
    set texto_autogenerado = 'Salieron ' || new.cantidad || ' hacia ' || v_obra_destino ||
      ' el ' || to_char(new.fecha, 'DD/MM/YYYY') ||
      ' - Quedaron ' || v_cantidad_resultante_origen || ' en ' || v_obra_origen
    where id = new.id;
  end if;

  return new;
end;
$$;

-- 4. Trigger after-delete: maneja NULL origen y revierte cantidad_total si era compra
create or replace function movimientos_after_delete() returns trigger
language plpgsql as $$
begin
  if old.inventario_origen_id is not null then
    perform recalcular_cantidad_actual(old.inventario_origen_id);
  end if;
  perform recalcular_cantidad_actual(old.inventario_destino_id);

  if old.tipo = 'compra' then
    update herramientas
    set cantidad_total = cantidad_total - old.cantidad
    from inventario_obra io
    where io.id = old.inventario_destino_id
      and herramientas.id = io.herramienta_id;
  end if;

  return old;
end;
$$;

-- 5. Vista historial_movimientos: LEFT JOINs + columna tipo + herramienta desde destino si origen es null
drop view if exists historial_movimientos;

create view historial_movimientos with (security_invoker = true) as
select
  m.id,
  m.tipo,
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

-- 6. RPC: registrar compra de herramienta
create function registrar_compra(
  p_herramienta_id  uuid,
  p_obra_destino_id uuid,
  p_cantidad        integer,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql as $$
declare
  v_inventario_destino_id uuid;
begin
  update herramientas
  set cantidad_total = cantidad_total + p_cantidad
  where id = p_herramienta_id;

  insert into inventario_obra (herramienta_id, obra_id, cantidad_inicial)
  values (p_herramienta_id, p_obra_destino_id, 0)
  on conflict (herramienta_id, obra_id) do nothing;

  select id into v_inventario_destino_id
  from inventario_obra
  where herramienta_id = p_herramienta_id and obra_id = p_obra_destino_id;

  insert into movimientos (
    inventario_origen_id, inventario_destino_id,
    cantidad, fecha, observaciones, tipo
  ) values (
    null, v_inventario_destino_id,
    p_cantidad, p_fecha, p_observaciones, 'compra'
  );
end;
$$;

-- ─── MATERIALES ───────────────────────────────────────────────────────────────

-- 7. Columna tipo en movimientos_material (inventario_origen_id ya era nullable)
alter table movimientos_material
  add column tipo text not null default 'traslado'
    check (tipo in ('traslado', 'compra'));

-- 8. Trigger after-delete: revierte cantidad_total si era compra
create or replace function movimientos_material_after_delete()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(old.inventario_origen_id);
  perform recalcular_cantidad_actual_material(old.inventario_destino_id);

  if old.tipo = 'compra' then
    update materiales
    set cantidad_total = cantidad_total - old.cantidad
    where id = old.material_id;
  end if;

  return old;
end;
$$;

-- 9. Vista historial_movimientos_material: agregar columna tipo
drop view if exists historial_movimientos_material;

create view historial_movimientos_material
with (security_invoker = true) as
select
  mm.id,
  mm.tipo,
  m.nombre          as material,
  o_origen.nombre   as obra_origen,
  o_destino.nombre  as obra_destino,
  mm.cantidad,
  mm.fecha::text    as fecha,
  e_entrega.nombre  as quien_entrega,
  e_recibe.nombre   as quien_recibe,
  mm.observaciones
from movimientos_material mm
join materiales m on m.id = mm.material_id
left join inventario_material im_origen  on im_origen.id  = mm.inventario_origen_id
left join inventario_material im_destino on im_destino.id = mm.inventario_destino_id
left join obras      o_origen  on o_origen.id  = im_origen.obra_id
left join obras      o_destino on o_destino.id = im_destino.obra_id
left join encargados e_entrega on e_entrega.id = mm.entregado_por
left join encargados e_recibe  on e_recibe.id  = mm.recibido_por
order by mm.fecha desc, mm.created_at desc;

-- 10. RPC: registrar compra de material
create function registrar_compra_material(
  p_material_id     uuid,
  p_obra_destino_id uuid,
  p_cantidad        integer,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql as $$
declare
  v_inventario_destino_id uuid;
begin
  update materiales
  set cantidad_total = cantidad_total + p_cantidad
  where id = p_material_id;

  insert into inventario_material (material_id, obra_id, cantidad_inicial)
  values (p_material_id, p_obra_destino_id, 0)
  on conflict (material_id, obra_id) do nothing;

  select id into v_inventario_destino_id
  from inventario_material
  where material_id = p_material_id and obra_id = p_obra_destino_id;

  insert into movimientos_material (
    material_id, inventario_origen_id, inventario_destino_id,
    cantidad, fecha, observaciones, tipo
  ) values (
    p_material_id, null, v_inventario_destino_id,
    p_cantidad, p_fecha, p_observaciones, 'compra'
  );
end;
$$;
