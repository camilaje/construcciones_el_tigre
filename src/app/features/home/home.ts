import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import { APP_ROUTE_ENUMERATION, SUPABASE_TABLE_ENUMERATION, SUPABASE_VIEW_ENUMERATION, SupabaseService } from '../../core';

interface CountResponseType {
  count: number | null;
  error: PostgrestError | null;
}

interface SiteInventoryRowType {
  currentQuantity: number;
}

interface SiteInventoryResponseType {
  data: SiteInventoryRowType[] | null;
  error: PostgrestError | null;
}

interface DashboardStatType {
  label: string;
  value: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private readonly supabaseService: SupabaseService;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly statsSignal: WritableSignal<DashboardStatType[]>;

  protected readonly appRoute: typeof APP_ROUTE_ENUMERATION;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly stats: Signal<DashboardStatType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.statsSignal = signal<DashboardStatType[]>([]);

    this.appRoute = APP_ROUTE_ENUMERATION;
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.stats = this.statsSignal.asReadonly();

    this.loadStatistics();
  }

  private loadStatistics(): void {
    const tools$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.TOOLS).select('*', { count: 'exact', head: true })
    );
    const sites$: Observable<CountResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.SITES).select('*', { count: 'exact', head: true })
    );
    const supervisors$: Observable<CountResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS)
        .select('*', { count: 'exact', head: true })
    );
    const movements$: Observable<CountResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.MOVEMENTS)
        .select('*', { count: 'exact', head: true })
    );
    const inventory$: Observable<SiteInventoryResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.SITE_SUMMARY)
        .select('currentQuantity:cantidad_actual')
    );

    combineLatest([tools$, sites$, supervisors$, movements$, inventory$]).subscribe(
      ([tools, sites, supervisors, movements, inventory]: [
        CountResponseType,
        CountResponseType,
        CountResponseType,
        CountResponseType,
        SiteInventoryResponseType
      ]): void => {
        this.loadingSignal.set(false);

        if (tools.error || sites.error || supervisors.error || movements.error || inventory.error) {
          this.errorMessageSignal.set('No se pudieron cargar las estadísticas.');
          return;
        }

        const rows: SiteInventoryRowType[] = inventory.data ?? [];
        const totalUnits: number = rows.reduce(
          (total: number, row: SiteInventoryRowType): number => total + row.currentQuantity,
          0
        );

        this.statsSignal.set([
          { label: 'Herramientas en catálogo', value: tools.count ?? 0 },
          { label: 'Obras activas', value: sites.count ?? 0 },
          { label: 'Encargados', value: supervisors.count ?? 0 },
          { label: 'Combinaciones obra + herramienta con stock', value: rows.length },
          { label: 'Unidades totales en inventario', value: totalUnits },
          { label: 'Movimientos registrados', value: movements.count ?? 0 }
        ]);
      }
    );
  }
}
