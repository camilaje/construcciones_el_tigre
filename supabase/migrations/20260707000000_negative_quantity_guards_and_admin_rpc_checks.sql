-- Corrige dos huecos detectados en auditoría del módulo de materiales/herramientas:
--
-- 1. inventario_material.cantidad_actual no tenía CHECK (cantidad_actual >= 0)
--    (inventario_obra sí lo tenía desde el inicio). Borrar un movimiento antiguo
--    "fuera de orden" (ej. una compra cuyo stock ya se trasladó/consumió después)
--    podía dejar el inventario en negativo sin que nada lo impidiera.
-- 2. registrar_compra, registrar_compra_material y dar_de_baja_herramienta solo
--    estaban restringidos a admin/super_admin en el frontend (roleGuard). Si un
--    worker invoca el RPC directamente (ej. consola del navegador), no hay nada
--    del lado de la base de datos que lo bloquee.
--
-- Este archivo:
--   a) normaliza cualquier valor negativo residual antes de agregar los CHECK
--      (defensivo: no debería haber ninguno, pero evita que la migración falle
--      si ya existiera alguno);
--   b) agrega los CHECK que faltaban (cantidad_actual y cantidad_total);
--   c) agrega un guard "amigable" en las funciones de recálculo, para que borrar
--      un movimiento que dejaría el inventario en negativo falle con un mensaje
--      claro en vez de un error crudo de constraint;
--   d) agrega el mismo tipo de guard para cantidad_total en los triggers de
--      borrado y en los RPCs que lo decrementan, por si cantidad_total ya venía
--      desincronizado (editado a mano en el catálogo);
--   e) agrega auth_role() en registrar_compra, registrar_compra_material y
--      dar_de_baja_herramienta para que la restricción de admin/super_admin se
--      cumpla también a nivel de base de datos, no solo en la UI.

-- ─── a) Normalización defensiva antes de agregar los CHECK ─────────────────────

update inventario_material set cantidad_actual = 0 where cantidad_actual < 0;
update herramientas set cantidad_total = 0 where cantidad_total < 0;
update materiales set cantidad_total = 0 where cantidad_total < 0;

-- ─── b) CHECK constraints que faltaban ─────────────────────────────────────────

alter table inventario_material
  add constraint inventario_material_cantidad_actual_check check (cantidad_actual >= 0);

alter table herramientas
  add constraint herramientas_cantidad_total_check check (cantidad_total >= 0);

alter table materiales
  add constraint materiales_cantidad_total_check check (cantidad_total >= 0);

-- ─── c) Guard amigable en recalcular_cantidad_actual (herramientas) ────────────

create or replace function recalcular_cantidad_actual(p_inventario_id uuid)
returns void language plpgsql as $$
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

-- ─── c) Guard amigable en recalcular_cantidad_actual_material (materiales) ─────

create or replace function recalcular_cantidad_actual_material(p_inventario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_resultado integer;
begin
  if p_inventario_id is null then return; end if;

  select
    cantidad_inicial
    + coalesce((
        select sum(cantidad) from movimientos_material
        where inventario_destino_id = p_inventario_id
      ), 0)
    - coalesce((
        select sum(cantidad) from movimientos_material
        where inventario_origen_id = p_inventario_id
      ), 0)
  into v_resultado
  from inventario_material
  where id = p_inventario_id;

  if v_resultado < 0 then
    raise exception 'No se puede completar esta operación: el inventario quedaría en % unidades (negativo). Revisa el orden de los movimientos relacionados con este registro.', v_resultado;
  end if;

  update inventario_material
  set cantidad_actual = v_resultado
  where id = p_inventario_id;
end;
$$;

-- ─── d) Guard de cantidad_total al borrar una compra (herramientas) ────────────

create or replace function movimientos_after_delete() returns trigger
language plpgsql as $$
declare
  v_nuevo_total integer;
begin
  if old.inventario_origen_id is not null then
    perform recalcular_cantidad_actual(old.inventario_origen_id);
  end if;
  if old.inventario_destino_id is not null then
    perform recalcular_cantidad_actual(old.inventario_destino_id);
  end if;

  if old.tipo = 'compra' then
    select h.cantidad_total - old.cantidad into v_nuevo_total
    from inventario_obra io join herramientas h on h.id = io.herramienta_id
    where io.id = old.inventario_destino_id;

    if v_nuevo_total < 0 then
      raise exception 'No se puede eliminar esta compra: el total de la herramienta en el catálogo quedaría en % unidades (negativo). Revisa el campo "Cantidad total" en Catálogos.', v_nuevo_total;
    end if;

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

-- ─── d) Guard de cantidad_total al borrar una compra (materiales) ──────────────

create or replace function movimientos_material_after_delete()
returns trigger language plpgsql as $$
declare
  v_nuevo_total integer;
begin
  perform recalcular_cantidad_actual_material(old.inventario_origen_id);
  perform recalcular_cantidad_actual_material(old.inventario_destino_id);

  if old.tipo = 'compra' then
    select cantidad_total - old.cantidad into v_nuevo_total
    from materiales where id = old.material_id;

    if v_nuevo_total < 0 then
      raise exception 'No se puede eliminar esta compra: el total del material en el catálogo quedaría en % unidades (negativo). Revisa el campo "Cantidad total" en Catálogos.', v_nuevo_total;
    end if;

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

-- ─── c/d/e) dar_de_baja_herramienta: rol admin + guard de cantidad_total ───────

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
  v_total_actual         integer;
begin
  if auth_role() not in ('admin', 'super_admin') then
    raise exception 'No tienes permisos para dar de baja herramientas. Solo un administrador puede hacerlo.';
  end if;

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

  select cantidad_total into v_total_actual from herramientas where id = p_herramienta_id;

  if v_total_actual < p_cantidad then
    raise exception 'Inconsistencia de datos: el total de la herramienta en el catálogo (%) es menor que la cantidad a dar de baja (%). Revisa el catálogo antes de continuar.', v_total_actual, p_cantidad;
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

-- ─── e) registrar_compra: rol admin ────────────────────────────────────────────

create or replace function registrar_compra(
  p_herramienta_id  uuid,
  p_obra_destino_id uuid,
  p_cantidad        integer,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql as $$
declare
  v_inventario_destino_id uuid;
begin
  if auth_role() not in ('admin', 'super_admin') then
    raise exception 'No tienes permisos para registrar compras. Solo un administrador puede hacerlo.';
  end if;

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

-- ─── e) registrar_compra_material: rol admin ───────────────────────────────────

create or replace function registrar_compra_material(
  p_material_id     uuid,
  p_obra_destino_id uuid,
  p_cantidad        integer,
  p_fecha           date    default current_date,
  p_observaciones   text    default null
) returns void language plpgsql as $$
declare
  v_inventario_destino_id uuid;
begin
  if auth_role() not in ('admin', 'super_admin') then
    raise exception 'No tienes permisos para registrar compras. Solo un administrador puede hacerlo.';
  end if;

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

-- ─── d) registrar_consumo_material: guard de cantidad_total ────────────────────
-- Se mantiene abierto a todos los roles (workers incluidos) — esa parte es
-- intencional y no cambia. Solo se agrega el guard contra drift de cantidad_total.

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
  v_total_actual         integer;
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

  select cantidad_total into v_total_actual from materiales where id = p_material_id;

  if v_total_actual < p_cantidad then
    raise exception 'Inconsistencia de datos: el total del material en el catálogo (%) es menor que la cantidad a consumir (%). Revisa el catálogo antes de continuar.', v_total_actual, p_cantidad;
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
