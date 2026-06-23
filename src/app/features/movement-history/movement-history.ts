import { Component, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
  imports: [MatTableModule, MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule, MatInputModule],
  templateUrl: './movement-history.html',
  styleUrl: './movement-history.scss'
})
export class MovementHistory {
  private readonly supabaseService: SupabaseService;
  private readonly rowsSignal: WritableSignal<MovementHistoryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly toolFilterSignal: WritableSignal<string | null>;
  private readonly siteFilterSignal: WritableSignal<string | null>;
  private readonly dateFromFilterSignal: WritableSignal<string | null>;
  private readonly dateToFilterSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<MovementHistoryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly toolFilter: Signal<string | null>;
  protected readonly siteFilter: Signal<string | null>;
  protected readonly toolOptions: Signal<string[]>;
  protected readonly siteOptions: Signal<string[]>;
  protected readonly filteredRows: Signal<MovementHistoryRowType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.rowsSignal = signal<MovementHistoryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.toolFilterSignal = signal<string | null>(null);
    this.siteFilterSignal = signal<string | null>(null);
    this.dateFromFilterSignal = signal<string | null>(null);
    this.dateToFilterSignal = signal<string | null>(null);

    this.columns = ['date', 'tool', 'route', 'quantity', 'deliveredBy', 'receivedBy', 'notes'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.toolFilter = this.toolFilterSignal.asReadonly();
    this.siteFilter = this.siteFilterSignal.asReadonly();

    this.toolOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((row): string => row.tool)));
    this.siteOptions = computed((): string[] =>
      this.uniqueSorted(this.rowsSignal().flatMap((row): string[] => [row.sourceSite, row.destinationSite]))
    );
    this.filteredRows = computed((): MovementHistoryRowType[] => {
      const tool: string | null = this.toolFilterSignal();
      const site: string | null = this.siteFilterSignal();
      const dateFrom: string | null = this.dateFromFilterSignal();
      const dateTo: string | null = this.dateToFilterSignal();

      return this.rowsSignal().filter((row: MovementHistoryRowType): boolean => {
        const matchesTool: boolean = !tool || row.tool === tool;
        const matchesSite: boolean = !site || row.sourceSite === site || row.destinationSite === site;
        const matchesFrom: boolean = !dateFrom || row.date >= dateFrom;
        const matchesTo: boolean = !dateTo || row.date <= dateTo;
        return matchesTool && matchesSite && matchesFrom && matchesTo;
      });
    });

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

  protected onToolFilterChange(value: string | null): void {
    this.toolFilterSignal.set(value);
  }

  protected onSiteFilterChange(value: string | null): void {
    this.siteFilterSignal.set(value);
  }

  protected onDateFromFilterChange(value: string): void {
    this.dateFromFilterSignal.set(value || null);
  }

  protected onDateToFilterChange(value: string): void {
    this.dateToFilterSignal.set(value || null);
  }

  private uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a: string, b: string): number => a.localeCompare(b));
  }
}
