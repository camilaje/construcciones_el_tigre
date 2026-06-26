-- Módulo de materiales: tablas, triggers, RPC y vistas

-- ─── Tablas ───────────────────────────────────────────────────────────────────

create table materiales (
  id            uuid default gen_random_uuid() primary key,
  nombre        text not null unique,
  cantidad_total integer not null default 0,
  observaciones text,
  created_at    timestamptz default now()
);

create table inventario_material (
  id             uuid default gen_random_uuid() primary key,
  material_id    uuid not null references materiales(id),
  obra_id        uuid not null references obras(id),
  cantidad_actual integer not null default 0,
  encargado_id   uuid references encargados(id),
  created_at     timestamptz default now(),
  unique(material_id, obra_id)
);

create table movimientos_material (
  id                     uuid default gen_random_uuid() primary key,
  material_id            uuid not null references materiales(id),
  inventario_origen_id   uuid references inventario_material(id),
  inventario_destino_id  uuid references inventario_material(id),
  cantidad               integer not null check (cantidad > 0),
  fecha                  date not null default current_date,
  entregado_por          uuid references encargados(id),
  recibido_por           uuid references encargados(id),
  observaciones          text,
  created_at             timestamptz default now()
);

-- ─── Función de recalculo ─────────────────────────────────────────────────────

create function recalcular_cantidad_actual_material(p_inventario_id uuid)
returns void language plpgsql as $$
begin
  if p_inventario_id is null then return; end if;

  update inventario_material
  set cantidad_actual =
    coalesce((
      select sum(cantidad) from movimientos_material
      where inventario_destino_id = p_inventario_id
    ), 0)
    -
    coalesce((
      select sum(cantidad) from movimientos_material
      where inventario_origen_id = p_inventario_id
    ), 0)
  where id = p_inventario_id;
end;
$$;

-- ─── Trigger: después de insertar movimiento ──────────────────────────────────

create function movimientos_material_after_insert()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(new.inventario_origen_id);
  perform recalcular_cantidad_actual_material(new.inventario_destino_id);
  return new;
end;
$$;

create trigger movimientos_material_after_insert_trigger
  after insert on movimientos_material
  for each row execute function movimientos_material_after_insert();

-- ─── Trigger: después de eliminar movimiento ─────────────────────────────────

create function movimientos_material_after_delete()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(old.inventario_origen_id);
  perform recalcular_cantidad_actual_material(old.inventario_destino_id);
  return old;
end;
$$;

create trigger movimientos_material_after_delete_trigger
  after delete on movimientos_material
  for each row execute function movimientos_material_after_delete();

-- ─── RPC: transferir material ─────────────────────────────────────────────────

create function transferir_material(
  p_material_id       uuid,
  p_obra_origen_id    uuid,
  p_obra_destino_id   uuid,
  p_cantidad          integer,
  p_quien_entrega_id  uuid    default null,
  p_quien_recibe_id   uuid    default null,
  p_fecha             date    default current_date,
  p_observaciones     text    default null
)
returns void language plpgsql as $$
declare
  v_inventario_origen_id   uuid;
  v_inventario_destino_id  uuid;
  v_stock_actual           integer;
begin
  select id, cantidad_actual
    into v_inventario_origen_id, v_stock_actual
    from inventario_material
   where material_id = p_material_id
     and obra_id     = p_obra_origen_id;

  if not found then
    raise exception 'No hay inventario de este material en la obra de origen.';
  end if;

  if v_stock_actual < p_cantidad then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_actual, p_cantidad;
  end if;

  insert into inventario_material (material_id, obra_id, cantidad_actual)
  values (p_material_id, p_obra_destino_id, 0)
  on conflict (material_id, obra_id) do nothing;

  select id into v_inventario_destino_id
    from inventario_material
   where material_id = p_material_id
     and obra_id     = p_obra_destino_id;

  insert into movimientos_material (
    material_id, inventario_origen_id, inventario_destino_id,
    cantidad, fecha, entregado_por, recibido_por, observaciones
  ) values (
    p_material_id, v_inventario_origen_id, v_inventario_destino_id,
    p_cantidad, p_fecha, p_quien_entrega_id, p_quien_recibe_id, p_observaciones
  );
end;
$$;

-- ─── Vistas ───────────────────────────────────────────────────────────────────

create view resumen_materiales
with (security_invoker = true) as
select
  m.id,
  m.nombre,
  m.observaciones,
  m.cantidad_total,
  coalesce(sum(im.cantidad_actual) filter (where not o.es_bodega), 0)::integer as en_obras,
  (m.cantidad_total - coalesce(sum(im.cantidad_actual) filter (where not o.es_bodega), 0))::integer as disponible
from materiales m
left join inventario_material im on im.material_id = m.id
left join obras o on o.id = im.obra_id
group by m.id, m.nombre, m.observaciones, m.cantidad_total
order by m.nombre;

create view resumen_por_obra_material
with (security_invoker = true) as
select
  im.id        as inventario_material_id,
  o.nombre     as obra,
  m.nombre     as material,
  im.cantidad_actual,
  e.nombre     as encargado,
  (
    select max(mm.fecha::text)
    from movimientos_material mm
    where mm.inventario_origen_id = im.id
       or mm.inventario_destino_id = im.id
  ) as ultimo_movimiento
from inventario_material im
join obras      o on o.id = im.obra_id
join materiales m on m.id = im.material_id
left join encargados e on e.id = im.encargado_id
where im.cantidad_actual > 0;

create view historial_movimientos_material
with (security_invoker = true) as
select
  mm.id,
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
