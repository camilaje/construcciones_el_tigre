-- Fix: "relation mo does not exist" runtime error.
--
-- The live versions of one or more trigger functions in Supabase diverged from
-- the local migrations (likely edited manually in the dashboard).  The live
-- body references a relation alias "mo" that no longer exists.  This migration
-- recreates the three functions that form the material trigger chain so the
-- live DB matches the correct definition.

-- 1. Core recalculation helper (SECURITY DEFINER — already in 20260705010000
--    but we re-assert it in case the live version was overwritten).
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

-- 2. Trigger fired after INSERT on inventario_material.
create or replace function inventario_material_after_insert()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(new.id);
  return new;
end;
$$;

-- 3. Trigger fired after INSERT on movimientos_material.
create or replace function movimientos_material_after_insert()
returns trigger language plpgsql as $$
begin
  perform recalcular_cantidad_actual_material(new.inventario_origen_id);
  perform recalcular_cantidad_actual_material(new.inventario_destino_id);
  return new;
end;
$$;

-- 4. Recalculate all existing records to correct any amounts that may have
--    been left wrong while the bug was active.
do $$
declare
  r record;
begin
  for r in select id from inventario_material loop
    perform recalcular_cantidad_actual_material(r.id);
  end loop;
end;
$$;
