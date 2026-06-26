-- Permite eliminar movimientos y recalcula las cantidades afectadas.
-- Sin esto, borrar un movimiento dejaría cantidad_actual incorrecta en ambos
-- inventarios (origen y destino) porque el trigger de INSERT no se deshace solo.
create function movimientos_after_delete() returns trigger
language plpgsql as $$
begin
  perform recalcular_cantidad_actual(old.inventario_origen_id);
  perform recalcular_cantidad_actual(old.inventario_destino_id);
  return old;
end;
$$;

create trigger movimientos_after_delete_trigger
  after delete on movimientos
  for each row execute function movimientos_after_delete();
