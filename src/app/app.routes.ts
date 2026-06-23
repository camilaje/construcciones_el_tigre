import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { APP_ROUTE_ENUMERATION } from './core/app-route';
import { SUPABASE_TABLE_ENUMERATION } from './core/supabase-schema';
import { Shell } from './shell/shell';
import { Login } from './features/login/login';
import { Home } from './features/home/home';
import { Inventory } from './features/inventory/inventory';
import { InventoryDetail } from './features/inventory-detail/inventory-detail';
import { RegisterTool } from './features/register-tool/register-tool';
import { RegisterMovement } from './features/register-movement/register-movement';
import { MovementHistory } from './features/movement-history/movement-history';
import { Catalog } from './features/catalog/catalog';

export const routes: Routes = [
  { path: APP_ROUTE_ENUMERATION.LOGIN.slice(1), component: Login },
  {
    path: APP_ROUTE_ENUMERATION.HOME.slice(1),
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: APP_ROUTE_ENUMERATION.HOME.slice(1), component: Home },
      { path: APP_ROUTE_ENUMERATION.INVENTORY.slice(1), component: Inventory },
      { path: `${APP_ROUTE_ENUMERATION.INVENTORY.slice(1)}/:id`, component: InventoryDetail },
      { path: APP_ROUTE_ENUMERATION.REGISTER_TOOL.slice(1), component: RegisterTool },
      { path: APP_ROUTE_ENUMERATION.REGISTER_MOVEMENT.slice(1), component: RegisterMovement },
      { path: APP_ROUTE_ENUMERATION.MOVEMENT_HISTORY.slice(1), component: MovementHistory },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_TOOLS.slice(1),
        component: Catalog,
        data: { table: SUPABASE_TABLE_ENUMERATION.TOOLS, label: 'Herramientas', singularLabel: 'Herramienta' }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_SITES.slice(1),
        component: Catalog,
        data: { table: SUPABASE_TABLE_ENUMERATION.SITES, label: 'Obras', singularLabel: 'Obra' }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_SUPERVISORS.slice(1),
        component: Catalog,
        data: { table: SUPABASE_TABLE_ENUMERATION.SUPERVISORS, label: 'Encargados', singularLabel: 'Encargado' }
      }
    ]
  },
  { path: '**', redirectTo: APP_ROUTE_ENUMERATION.HOME.slice(1) }
];
