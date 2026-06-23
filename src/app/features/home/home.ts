import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';

interface CountResponse {
  count: number | null;
  error: PostgrestError | null;
}

interface SiteInventoryRow {
  currentQuantity: number;
}

interface SiteInventoryResponse {
  data: SiteInventoryRow[] | null;
  error: PostgrestError | null;
}

interface DashboardStat {
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
  private readonly statsSignal: WritableSignal<DashboardStat[]>;

  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly stats: Signal<DashboardStat[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.statsSignal = signal<DashboardStat[]>([]);

    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.stats = this.statsSignal.asReadonly();

    this.loadStatistics();
  }

  private loadStatistics(): void {
    const tools$: Observable<CountResponse> = from(
      this.supabaseService.client.from('herramientas').select('*', { count: 'exact', head: true })
    );
    const sites$: Observable<CountResponse> = from(
      this.supabaseService.client.from('obras').select('*', { count: 'exact', head: true })
    );
    const supervisors$: Observable<CountResponse> = from(
      this.supabaseService.client.from('encargados').select('*', { count: 'exact', head: true })
    );
    const movements$: Observable<CountResponse> = from(
      this.supabaseService.client.from('movimientos').select('*', { count: 'exact', head: true })
    );
    const inventory$: Observable<SiteInventoryResponse> = from(
      this.supabaseService.client.from('resumen_por_obra').select('currentQuantity:cantidad_actual')
    );

    combineLatest([tools$, sites$, supervisors$, movements$, inventory$]).subscribe(
      ([tools, sites, supervisors, movements, inventory]: [
        CountResponse,
        CountResponse,
        CountResponse,
        CountResponse,
        SiteInventoryResponse
      ]): void => {
        this.loadingSignal.set(false);

        if (tools.error || sites.error || supervisors.error || movements.error || inventory.error) {
          this.errorMessageSignal.set('No se pudieron cargar las estadísticas.');
          return;
        }

        const rows: SiteInventoryRow[] = inventory.data ?? [];
        const totalUnits: number = rows.reduce(
          (total: number, row: SiteInventoryRow): number => total + row.currentQuantity,
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
