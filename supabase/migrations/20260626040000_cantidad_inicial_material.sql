-- Agregar cantidad_inicial a inventario_material.
-- Sin esta columna, el trigger de movimientos sobreescribe cantidad_actual a 0
-- al primer traslado, ignorando el stock que se ingresó en el alta inicial.

alter table inventario_material add column cantidad_inicial integer not null default 0;

-- Actualizar recalculo para incluir cantidad_inicial en el cómputo de cantidad_actual.
create or replace function recalcular_cantidad_actual_material(p_inventario_id uuid)
returns void language plpgsql as $$
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

-- Trigger: al insertar en inventario_material, recalcular cantidad_actual para que
-- refleje la cantidad_inicial (sin movimientos, queda igual a cantidad_inicial).
create function inventario_material_after_insert()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(new.id);
  return new;
end;
$$;

create trigger inventario_material_after_insert_trigger
  after insert on inventario_material
  for each row execute function inventario_material_after_insert();
