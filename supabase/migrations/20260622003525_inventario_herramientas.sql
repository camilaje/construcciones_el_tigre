-- Catalogos: Herramienta, Obra, Encargado
create table herramientas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table encargados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table herramientas enable row level security;
alter table obras enable row level security;
alter table encargados enable row level security;

create policy "authenticated full access" on herramientas
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on obras
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on encargados
  for all to authenticated using (true) with check (true);

-- Inventario por obra: una fila por combinacion Herramienta x Obra
create table inventario_obra (
  id uuid primary key default gen_random_uuid(),
  herramienta_id uuid not null references herramientas (id) on delete restrict,
  obra_id uuid not null references obras (id) on delete restrict,
  cantidad_inicial integer not null check (cantidad_inicial >= 0),
  cantidad_actual integer not null default 0 check (cantidad_actual >= 0),
  encargado_id uuid references encargados (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (herramienta_id, obra_id)
);

alter table inventario_obra enable row level security;
create policy "authenticated full access" on inventario_obra
  for all to authenticated using (true) with check (true);

create index inventario_obra_obra_id_idx on inventario_obra (obra_id);
create index inventario_obra_herramienta_id_idx on inventario_obra (herramienta_id);

-- cantidad_actual arranca igual a cantidad_inicial al crear el registro
create function set_cantidad_actual_inicial() returns trigger
language plpgsql as $$
begin
  new.cantidad_actual := new.cantidad_inicial;
  return new;
end;
$$;

create trigger inventario_obra_set_cantidad_actual
  before insert on inventario_obra
  for each row execute function set_cantidad_actual_inicial();

-- Historial de movimientos: 1 a muchos respecto a inventario_obra.
-- Todo movimiento es un traslado obra-a-obra (la cantidad_inicial de la
-- primera llegada de una herramienta se ingresa directo en inventario_obra,
-- sin pasar por aqui).
create table movimientos (
  id uuid primary key default gen_random_uuid(),
  inventario_origen_id uuid not null references inventario_obra (id) on delete restrict,
  inventario_destino_id uuid not null references inventario_obra (id) on delete restrict,
  cantidad integer not null check (cantidad > 0),
  quien_entrega_id uuid references encargados (id) on delete set null,
  quien_recibe_id uuid references encargados (id) on delete set null,
  fecha date not null default current_date,
  observaciones text,
  texto_autogenerado text,
  created_at timestamptz not null default now(),
  check (inventario_origen_id <> inventario_destino_id)
);

alter table movimientos enable row level security;
create policy "authenticated full access" on movimientos
  for all to authenticated using (true) with check (true);

create index movimientos_origen_idx on movimientos (inventario_origen_id);
create index movimientos_destino_idx on movimientos (inventario_destino_id);

-- Recalcula cantidad_actual de un registro de inventario a partir de su
-- cantidad_inicial mas todo lo que entro y salio en movimientos.
create function recalcular_cantidad_actual(p_inventario_id uuid) returns void
language plpgsql as $$
declare
  v_inicial integer;
  v_entradas integer;
  v_salidas integer;
begin
  select cantidad_inicial into v_inicial from inventario_obra where id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_entradas
  from movimientos where inventario_destino_id = p_inventario_id;

  select coalesce(sum(cantidad), 0) into v_salidas
  from movimientos where inventario_origen_id = p_inventario_id;

  update inventario_obra
  set cantidad_actual = v_inicial + v_entradas - v_salidas
  where id = p_inventario_id;
end;
$$;

-- Genera el texto legible del movimiento y recalcula ambos lados afectados.
create function movimientos_after_insert() returns trigger
language plpgsql as $$
declare
  v_obra_origen text;
  v_obra_destino text;
  v_cantidad_resultante_origen integer;
begin
  perform recalcular_cantidad_actual(new.inventario_origen_id);
  perform recalcular_cantidad_actual(new.inventario_destino_id);

  select o.nombre, i.cantidad_actual into v_obra_origen, v_cantidad_resultante_origen
  from inventario_obra i join obras o on o.id = i.obra_id
  where i.id = new.inventario_origen_id;

  select o.nombre into v_obra_destino
  from inventario_obra i join obras o on o.id = i.obra_id
  where i.id = new.inventario_destino_id;

  update movimientos
  set texto_autogenerado = 'Salieron ' || new.cantidad || ' hacia ' || v_obra_destino ||
    ' el ' || to_char(new.fecha, 'DD/MM/YYYY') ||
    ' - Quedaron ' || v_cantidad_resultante_origen || ' en ' || v_obra_origen
  where id = new.id;

  return new;
end;
$$;

create trigger movimientos_after_insert_trigger
  after insert on movimientos
  for each row execute function movimientos_after_insert();

-- Traslado atomico entre obras: valida stock en origen, crea el registro
-- de inventario en destino si no existe, e inserta el movimiento.
create function transferir_herramienta(
  p_herramienta_id uuid,
  p_obra_origen_id uuid,
  p_obra_destino_id uuid,
  p_cantidad integer,
  p_quien_entrega_id uuid,
  p_quien_recibe_id uuid,
  p_fecha date,
  p_observaciones text
) returns uuid
language plpgsql as $$
declare
  v_origen_id uuid;
  v_destino_id uuid;
  v_disponible integer;
  v_movimiento_id uuid;
begin
  select id, cantidad_actual into v_origen_id, v_disponible
  from inventario_obra
  where herramienta_id = p_herramienta_id and obra_id = p_obra_origen_id;

  if v_origen_id is null then
    raise exception 'La herramienta no tiene inventario registrado en la obra de origen';
  end if;

  if v_disponible < p_cantidad then
    raise exception 'Cantidad insuficiente en origen: disponible %, solicitado %', v_disponible, p_cantidad;
  end if;

  select id into v_destino_id
  from inventario_obra
  where herramienta_id = p_herramienta_id and obra_id = p_obra_destino_id;

  if v_destino_id is null then
    insert into inventario_obra (herramienta_id, obra_id, cantidad_inicial)
    values (p_herramienta_id, p_obra_destino_id, 0)
    returning id into v_destino_id;
  end if;

  insert into movimientos (
    inventario_origen_id, inventario_destino_id, cantidad,
    quien_entrega_id, quien_recibe_id, fecha, observaciones
  ) values (
    v_origen_id, v_destino_id, p_cantidad,
    p_quien_entrega_id, p_quien_recibe_id, p_fecha, p_observaciones
  ) returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

-- Vista consolidada equivalente a "Resumen_por_Obra": total actual por
-- Obra+Herramienta y texto del ultimo movimiento, sin formulas fragiles.
create view resumen_por_obra with (security_invoker = true) as
select
  io.id as inventario_obra_id,
  o.id as obra_id,
  o.nombre as obra,
  h.id as herramienta_id,
  h.nombre as herramienta,
  io.cantidad_actual,
  e.nombre as encargado,
  (
    select m.texto_autogenerado
    from movimientos m
    where m.inventario_origen_id = io.id or m.inventario_destino_id = io.id
    order by m.created_at desc
    limit 1
  ) as ultimo_movimiento
from inventario_obra io
join obras o on o.id = io.obra_id
join herramientas h on h.id = io.herramienta_id
left join encargados e on e.id = io.encargado_id
where io.cantidad_actual > 0;
