import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, filter, from, switchMap } from 'rxjs';

import {
  APP_ROLE_ENUMERATION,
  AuthService,
  ConfirmationService,
  NotificationService,
  SUPABASE_TABLE_ENUMERATION,
  SUPABASE_VIEW_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface MovementHistoryRowType {
  id: string;
  tool: string;
  sourceSite: string | null;
  destinationSite: string | null;
  quantity: number;
  deliveredBy: string | null;
  receivedBy: string | null;
  date: string;
  notes: string | null;
  type: 'traslado' | 'compra' | 'baja';
  reason: string | null;
}

interface MovementHistoryResponseType {
  data: MovementHistoryRowType[] | null;
  error: PostgrestError | null;
}

interface MutationResponseType {
  error: PostgrestError | null;
}

interface MovementHistoryStatType {
  label: string;
  value: number;
}

@Component({
  selector: 'app-movement-history',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    LoadingOverlay,
    ErrorBanner
  ],
  templateUrl: './movement-history.html',
  styleUrl: './movement-history.scss'
})
export class MovementHistory {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly confirmationService: ConfirmationService;
  private readonly notificationService: NotificationService;
  private readonly destroyRef: DestroyRef;
  private readonly rowsSignal: WritableSignal<MovementHistoryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly toolFilterSignal: WritableSignal<string | null>;
  private readonly siteFilterSignal: WritableSignal<string | null>;
  private readonly dateFromFilterSignal: WritableSignal<string | null>;
  private readonly dateToFilterSignal: WritableSignal<string | null>;

  protected readonly columns: Signal<string[]>;
  protected readonly canModify: Signal<boolean>;
  protected readonly rows: Signal<MovementHistoryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly toolFilter: Signal<string | null>;
  protected readonly siteFilter: Signal<string | null>;
  protected readonly toolOptions: Signal<string[]>;
  protected readonly siteOptions: Signal<string[]>;
  protected readonly filteredRows: Signal<MovementHistoryRowType[]>;
  protected readonly stats: Signal<MovementHistoryStatType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.confirmationService = inject(ConfirmationService);
    this.notificationService = inject(NotificationService);
    this.destroyRef = inject(DestroyRef);
    this.rowsSignal = signal<MovementHistoryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.toolFilterSignal = signal<string | null>(null);
    this.siteFilterSignal = signal<string | null>(null);
    this.dateFromFilterSignal = signal<string | null>(null);
    this.dateToFilterSignal = signal<string | null>(null);

    this.canModify = computed((): boolean => this.authService.role() !== APP_ROLE_ENUMERATION.WORKER);
    this.columns = computed((): string[] => {
      const base: string[] = ['date', 'tool', 'route', 'quantity', 'deliveredBy', 'receivedBy', 'notes'];
      return this.canModify() ? [...base, 'actions'] : base;
    });
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.toolFilter = this.toolFilterSignal.asReadonly();
    this.siteFilter = this.siteFilterSignal.asReadonly();

    this.toolOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((row): string => row.tool)));
    this.siteOptions = computed((): string[] =>
      this.uniqueSorted(
        this.rowsSignal()
          .flatMap((row): (string | null)[] => [row.sourceSite, row.destinationSite])
          .filter((s): s is string => s !== null)
      )
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
    this.stats = computed((): MovementHistoryStatType[] => {
      const rows: MovementHistoryRowType[] = this.rowsSignal();

      return [
        { label: 'Movimientos registrados', value: rows.length },
        {
          label: 'Unidades trasladadas',
          value: rows.reduce((total: number, row: MovementHistoryRowType): number => total + row.quantity, 0)
        },
        { label: 'Herramientas distintas', value: this.toolOptions().length },
        { label: 'Obras involucradas', value: this.siteOptions().length }
      ];
    });

    this.loadRows();
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

  protected remove(row: MovementHistoryRowType): void {
    const origin: string = row.type === 'compra' ? 'Compra externa' : (row.sourceSite ?? '');
    const destination: string = row.type === 'baja' ? 'Baja' : (row.destinationSite ?? '');
    this.confirmationService
      .confirm(`¿Eliminar el ${row.type === 'compra' ? 'ingreso por compra' : row.type === 'baja' ? 'registro de baja' : 'movimiento'} de "${row.tool}" (${origin} → ${destination}, ${row.date})? Las cantidades de inventario se recalcularán automáticamente.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<MutationResponseType> => {
          this.loadingSignal.set(true);
          return from(
            this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.MOVEMENTS).delete().eq('id', row.id)
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.loadingSignal.set(false);
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.notificationService.success('Movimiento eliminado y cantidades recalculadas.');
        this.loadRows();
      });
  }

  private loadRows(): void {
    this.loadingSignal.set(true);

    from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.MOVEMENT_HISTORY)
        .select(
          'id, type:tipo, tool:herramienta, sourceSite:obra_origen, destinationSite:obra_destino, quantity:cantidad, deliveredBy:quien_entrega, receivedBy:quien_recibe, date:fecha, notes:observaciones, reason:motivo'
        )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MovementHistoryResponseType): void => {
        this.loadingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.rowsSignal.set(result.data ?? []);
      });
  }

  private uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a: string, b: string): number => a.localeCompare(b));
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
