import { Routes } from '@angular/router';
import { APP_ROLE_ENUMERATION, APP_ROUTE_ENUMERATION, SUPABASE_TABLE_ENUMERATION, SUPABASE_VIEW_ENUMERATION, authGuard, roleGuard } from './core';
import { Shell } from './shell';
import {
  Login,
  Home,
  Inventory,
  InventoryDetail,
  RegisterTool,
  RegisterMovement,
  MovementHistory,
  Catalog,
  MaterialInventory,
  RegisterMaterialInitial,
  RegisterMaterial,
  MaterialHistory,
  UserManagement
} from './features';

export const routes: Routes = [
  { path: APP_ROUTE_ENUMERATION.LOGIN.slice(1), component: Login },
  {
    path: APP_ROUTE_ENUMERATION.HOME.slice(1),
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: APP_ROUTE_ENUMERATION.HOME.slice(1), component: Home, data: { title: 'Inicio' } },

      // Herramientas
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

      // Materiales
      {
        path: APP_ROUTE_ENUMERATION.MATERIAL_INVENTORY.slice(1),
        component: MaterialInventory,
        data: { title: 'Inventario de materiales' }
      },
      {
        path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL_INITIAL.slice(1),
        component: RegisterMaterialInitial,
        data: { title: 'Registrar material en obra' }
      },
      {
        path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL.slice(1),
        component: RegisterMaterial,
        data: { title: 'Registrar movimiento de material' }
      },
      {
        path: APP_ROUTE_ENUMERATION.MATERIAL_HISTORY.slice(1),
        component: MaterialHistory,
        data: { title: 'Historial de movimientos de material' }
      },

      // Catálogos
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_TOOLS.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de herramientas',
          table: SUPABASE_TABLE_ENUMERATION.TOOLS,
          summaryView: SUPABASE_VIEW_ENUMERATION.TOOL_SUMMARY,
          label: 'Herramientas',
          singularLabel: 'Herramienta',
          hasQuantity: true
        }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_MATERIALS.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de materiales',
          table: SUPABASE_TABLE_ENUMERATION.MATERIALS,
          summaryView: SUPABASE_VIEW_ENUMERATION.MATERIAL_SUMMARY,
          label: 'Materiales',
          singularLabel: 'Material',
          hasQuantity: true,
          hasObservations: true
        }
      },
      {
        path: APP_ROUTE_ENUMERATION.CATALOG_SITES.slice(1),
        component: Catalog,
        data: {
          title: 'Catálogo de obras',
          table: SUPABASE_TABLE_ENUMERATION.SITES,
          label: 'Obras',
          singularLabel: 'Obra',
          hasBodega: true
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
      },
      {
        path: APP_ROUTE_ENUMERATION.USER_MANAGEMENT.slice(1),
        component: UserManagement,
        canActivate: [roleGuard([APP_ROLE_ENUMERATION.ADMIN, APP_ROLE_ENUMERATION.SUPER_ADMIN])],
        data: { title: 'Gestión de usuarios' }
      }
    ]
  },
  { path: '**', redirectTo: APP_ROUTE_ENUMERATION.HOME.slice(1) }
];
