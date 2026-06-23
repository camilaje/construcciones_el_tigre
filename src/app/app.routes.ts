import { Routes } from '@angular/router';
import { APP_ROUTE_ENUMERATION, SUPABASE_TABLE_ENUMERATION, authGuard } from './core';
import { Shell } from './shell';
import {
  Login,
  Home,
  Inventory,
  InventoryDetail,
  RegisterTool,
  RegisterMovement,
  MovementHistory,
  Catalog
} from './features';

export const routes: Routes = [
  { path: APP_ROUTE_ENUMERATION.LOGIN.slice(1), component: Login },
  {
    path: APP_ROUTE_ENUMERATION.HOME.slice(1),
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: APP_ROUTE_ENUMERATION.HOME.slice(1), component: Home, data: { title: 'Inicio' } },
      { path: APP_ROUTE_ENUMERATION.INVENTORY.slice(1), component: Inventory, data: { title: 'Inventario por Obra' } },
      {
        path: `${APP_ROUTE_ENUMERATION.INVENTORY.slice(1)}/:id`,
        component: InventoryDetail,
        data: { title: 'Detalle de inventario' }
      },
      {
        path: APP_ROUTE_ENUMERATION.REGISTER_TOOL.slice(1),
        component: RegisterTool,
        data: { title: 'Registrar herramienta nueva' }
      },
      {
        path: APP_ROUTE_ENUMERATION.REGISTER_MOVEMENT.slice(1),
        component: RegisterMovement,
        data: { title: 'Registrar movimiento' }
      },
      {
        path: APP_ROUTE_ENUMERATION.MOVEMENT_HISTORY.slice(1),
        component: MovementHistory,
        data: { title: 'Historial de movimientos' }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_TOOLS.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de herramientas',
          table: SUPABASE_TABLE_ENUMERATION.TOOLS,
          label: 'Herramientas',
          singularLabel: 'Herramienta'
        }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_SITES.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de obras',
          table: SUPABASE_TABLE_ENUMERATION.SITES,
          label: 'Obras',
          singularLabel: 'Obra'
        }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_SUPERVISORS.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de encargados',
          table: SUPABASE_TABLE_ENUMERATION.SUPERVISORS,
          label: 'Encargados',
          singularLabel: 'Encargado'
        }
      }
    ]
  },
  { path: '**', redirectTo: APP_ROUTE_ENUMERATION.HOME.slice(1) }
];
