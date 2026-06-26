-- Agrega cantidad total de herramientas y flag de bodega en obras

alter table herramientas
  add column cantidad_total integer not null default 0;

alter table obras
  add column es_bodega boolean not null default false;

-- Vista que calcula, por herramienta:
--   en_obras   = unidades actualmente asignadas a obras activas (es_bodega = false)
--   disponible = cantidad_total - en_obras  (incluye las que están en bodegas)
create view resumen_herramientas
with (security_invoker = true)
as
select
  h.id,
  h.nombre,
  h.cantidad_total,
  coalesce(
    sum(io.cantidad_actual) filter (where not o.es_bodega),
    0
  )::integer as en_obras,
  (
    h.cantidad_total
    - coalesce(
        sum(io.cantidad_actual) filter (where not o.es_bodega),
        0
      )
  )::integer as disponible
from herramientas h
left join inventario_obra io on io.herramienta_id = h.id
left join obras o on o.id = io.obra_id
group by h.id, h.nombre, h.cantidad_total
order by h.nombre;
