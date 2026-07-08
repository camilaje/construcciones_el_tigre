import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import {
  APP_ROUTE_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SUPABASE_VIEW_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface CountResponseType {
  count: number | null;
  error: PostgrestError | null;
}

interface InventoryRowType {
  currentQuantity: number;
}

interface InventoryResponseType {
  data: InventoryRowType[] | null;
  error: PostgrestError | null;
}

interface DashboardStatType {
  label: string;
  value: number;
}

interface ActionGroupType {
  title: string;
  primary: { label: string; path: APP_ROUTE_ENUMERATION };
  secondary: { label: string; path: APP_ROUTE_ENUMERATION }[];
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatCardModule, MatButtonModule, LoadingOverlay, ErrorBanner],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private readonly supabaseService: SupabaseService;
  private readonly destroyRef: DestroyRef;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly statsSignal: WritableSignal<DashboardStatType[]>;

  protected readonly actionGroups: ActionGroupType[];
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly stats: Signal<DashboardStatType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.destroyRef = inject(DestroyRef);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.statsSignal = signal<DashboardStatType[]>([]);

    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.stats = this.statsSignal.asReadonly();

    this.actionGroups = [
      {
        title: 'Herramientas',
        primary: { label: 'Registrar herramienta nueva en obra', path: APP_ROUTE_ENUMERATION.REGISTER_TOOL },
        secondary: [
          { label: 'Registrar movimiento', path: APP_ROUTE_ENUMERATION.REGISTER_MOVEMENT },
          { label: 'Ver inventario', path: APP_ROUTE_ENUMERATION.INVENTORY }
        ]
      },
      {
        title: 'Materiales',
        primary: { label: 'Registrar material nuevo en obra', path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL_INITIAL },
        secondary: [
          { label: 'Registrar movimiento', path: APP_ROUTE_ENUMERATION.REGISTER_MATERIAL },
          { label: 'Ver inventario', path: APP_ROUTE_ENUMERATION.MATERIAL_INVENTORY }
        ]
      }
    ];

    this.loadStatistics();
  }

  private loadStatistics(): void {
    const tools$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.TOOLS).select('*', { count: 'exact', head: true })
    );
    const materials$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.MATERIALS).select('*', { count: 'exact', head: true })
    );
    const sites$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.SITES).select('*', { count: 'exact', head: true })
    );
    const supervisors$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS).select('*', { count: 'exact', head: true })
    );
    const movements$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.MOVEMENTS).select('*', { count: 'exact', head: true })
    );
    const materialMovements$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.MATERIAL_MOVEMENTS).select('*', { count: 'exact', head: true })
    );
    const toolInventory$: Observable<InventoryResponseType> = from(
      this.supabaseService.client.from(SUPABASE_VIEW_ENUMERATION.SITE_SUMMARY).select('currentQuantity:cantidad_actual')
    );
    const materialInventory$: Observable<InventoryResponseType> = from(
      this.supabaseService.client.from(SUPABASE_VIEW_ENUMERATION.MATERIAL_SITE_SUMMARY).select('currentQuantity:cantidad_actual')
    );

    combineLatest([tools$, materials$, sites$, supervisors$, movements$, materialMovements$, toolInventory$, materialInventory$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        ([tools, materials, sites, supervisors, movements, materialMovements, toolInventory, materialInventory]: [
          CountResponseType,
          CountResponseType,
          CountResponseType,
          CountResponseType,
          CountResponseType,
          CountResponseType,
          InventoryResponseType,
          InventoryResponseType
        ]): void => {
          this.loadingSignal.set(false);

          if (
            tools.error || materials.error || sites.error || supervisors.error ||
            movements.error || materialMovements.error || toolInventory.error || materialInventory.error
          ) {
            this.errorMessageSignal.set('No se pudieron cargar las estadísticas.');
            return;
          }

          const toolRows: InventoryRowType[] = toolInventory.data ?? [];
          const materialRows: InventoryRowType[] = materialInventory.data ?? [];
          const totalToolUnits: number = toolRows.reduce((t, r): number => t + r.currentQuantity, 0);
          const totalMaterialUnits: number = materialRows.reduce((t, r): number => t + r.currentQuantity, 0);

          this.statsSignal.set([
            { label: 'Herramientas en catálogo', value: tools.count ?? 0 },
            { label: 'Combinaciones obra + herramienta con stock', value: toolRows.length },
            { label: 'Unidades de herramientas en inventario', value: totalToolUnits },
            { label: 'Movimientos de herramientas', value: movements.count ?? 0 },
            { label: 'Materiales en catálogo', value: materials.count ?? 0 },
            { label: 'Combinaciones obra + material con stock', value: materialRows.length },
            { label: 'Unidades de material en inventario', value: totalMaterialUnits },
            { label: 'Movimientos de materiales', value: materialMovements.count ?? 0 },
            { label: 'Obras activas', value: sites.count ?? 0 },
            { label: 'Encargados', value: supervisors.count ?? 0 }
          ]);
        }
      );
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
