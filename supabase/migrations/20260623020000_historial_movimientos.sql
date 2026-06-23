-- Vista de solo lectura para la pantalla "Historial de movimientos": resuelve
-- nombres legibles (herramienta, obra origen/destino, quien entrega/recibe)
-- a partir de movimientos + inventario_obra, sin tocar las tablas base.
create view historial_movimientos with (security_invoker = true) as
select
  m.id,
  m.cantidad,
  m.fecha,
  m.observaciones,
  m.texto_autogenerado,
  m.created_at,
  h.nombre as herramienta,
  oo.nombre as obra_origen,
  od.nombre as obra_destino,
  qe.nombre as quien_entrega,
  qr.nombre as quien_recibe
from movimientos m
join inventario_obra io_origen on io_origen.id = m.inventario_origen_id
join inventario_obra io_destino on io_destino.id = m.inventario_destino_id
join herramientas h on h.id = io_origen.herramienta_id
join obras oo on oo.id = io_origen.obra_id
join obras od on od.id = io_destino.obra_id
left join encargados qe on qe.id = m.quien_entrega_id
left join encargados qr on qr.id = m.quien_recibe_id
order by m.created_at desc;
