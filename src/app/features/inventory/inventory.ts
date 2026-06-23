import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';

interface SiteSummaryRow {
  inventoryId: string;
  site: string;
  tool: string;
  currentQuantity: number;
  supervisor: string | null;
  lastMovement: string | null;
}

interface SiteSummaryResponse {
  data: SiteSummaryRow[] | null;
  error: PostgrestError | null;
}

@Component({
  selector: 'app-inventory',
  imports: [MatTableModule, MatProgressSpinnerModule],
  templateUrl: './inventory.html',
  styleUrl: './inventory.scss'
})
export class Inventory {
  private readonly supabaseService: SupabaseService;
  private readonly rowsSignal: WritableSignal<SiteSummaryRow[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<SiteSummaryRow[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.rowsSignal = signal<SiteSummaryRow[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);

    this.columns = ['site', 'tool', 'currentQuantity', 'supervisor', 'lastMovement'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    from(
      this.supabaseService.client
        .from('resumen_por_obra')
        .select(
          'inventoryId:inventario_obra_id, site:obra, tool:herramienta, currentQuantity:cantidad_actual, supervisor:encargado, lastMovement:ultimo_movimiento'
        )
    ).subscribe((result: SiteSummaryResponse): void => {
      this.loadingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      this.rowsSignal.set(result.data ?? []);
    });
  }
}
