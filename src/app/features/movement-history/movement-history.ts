import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { SUPABASE_VIEW_ENUMERATION, SupabaseService } from '../../core';

interface MovementHistoryRowType {
  id: string;
  tool: string;
  sourceSite: string;
  destinationSite: string;
  quantity: number;
  deliveredBy: string | null;
  receivedBy: string | null;
  date: string;
  notes: string | null;
}

interface MovementHistoryResponseType {
  data: MovementHistoryRowType[] | null;
  error: PostgrestError | null;
}

@Component({
  selector: 'app-movement-history',
  imports: [MatTableModule, MatProgressSpinnerModule],
  templateUrl: './movement-history.html',
  styleUrl: './movement-history.scss'
})
export class MovementHistory {
  private readonly supabaseService: SupabaseService;
  private readonly rowsSignal: WritableSignal<MovementHistoryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<MovementHistoryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.rowsSignal = signal<MovementHistoryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);

    this.columns = ['date', 'tool', 'route', 'quantity', 'deliveredBy', 'receivedBy', 'notes'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.MOVEMENT_HISTORY)
        .select(
          'id, tool:herramienta, sourceSite:obra_origen, destinationSite:obra_destino, quantity:cantidad, deliveredBy:quien_entrega, receivedBy:quien_recibe, date:fecha, notes:observaciones'
        )
    ).subscribe((result: MovementHistoryResponseType): void => {
      this.loadingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      this.rowsSignal.set(result.data ?? []);
    });
  }
}
