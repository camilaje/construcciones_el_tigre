import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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

interface MaterialHistoryRowType {
  id: string;
  material: string;
  sourceSite: string;
  destinationSite: string;
  quantity: number;
  deliveredBy: string | null;
  receivedBy: string | null;
  date: string;
  notes: string | null;
}

interface MaterialHistoryResponseType {
  data: MaterialHistoryRowType[] | null;
  error: PostgrestError | null;
}

interface MutationResponseType {
  error: PostgrestError | null;
}

interface StatType {
  label: string;
  value: number;
}

@Component({
  selector: 'app-material-history',
  imports: [
    MatTableModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './material-history.html',
  styleUrl: './material-history.scss'
})
export class MaterialHistory {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly confirmationService: ConfirmationService;
  private readonly notificationService: NotificationService;
  private readonly destroyRef: DestroyRef;
  private readonly rowsSignal: WritableSignal<MaterialHistoryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly materialFilterSignal: WritableSignal<string | null>;
  private readonly siteFilterSignal: WritableSignal<string | null>;
  private readonly dateFromFilterSignal: WritableSignal<string | null>;
  private readonly dateToFilterSignal: WritableSignal<string | null>;

  protected readonly columns: Signal<string[]>;
  protected readonly canModify: Signal<boolean>;
  protected readonly rows: Signal<MaterialHistoryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly materialFilter: Signal<string | null>;
  protected readonly siteFilter: Signal<string | null>;
  protected readonly materialOptions: Signal<string[]>;
  protected readonly siteOptions: Signal<string[]>;
  protected readonly filteredRows: Signal<MaterialHistoryRowType[]>;
  protected readonly stats: Signal<StatType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.confirmationService = inject(ConfirmationService);
    this.notificationService = inject(NotificationService);
    this.destroyRef = inject(DestroyRef);
    this.rowsSignal = signal<MaterialHistoryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.materialFilterSignal = signal<string | null>(null);
    this.siteFilterSignal = signal<string | null>(null);
    this.dateFromFilterSignal = signal<string | null>(null);
    this.dateToFilterSignal = signal<string | null>(null);

    this.canModify = computed((): boolean => this.authService.role() !== APP_ROLE_ENUMERATION.WORKER);
    this.columns = computed((): string[] => {
      const base: string[] = ['date', 'material', 'route', 'quantity', 'deliveredBy', 'receivedBy', 'notes'];
      return this.canModify() ? [...base, 'actions'] : base;
    });
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.materialFilter = this.materialFilterSignal.asReadonly();
    this.siteFilter = this.siteFilterSignal.asReadonly();

    this.materialOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((r): string => r.material)));
    this.siteOptions = computed((): string[] =>
      this.uniqueSorted(this.rowsSignal().flatMap((r): string[] => [r.sourceSite, r.destinationSite]))
    );
    this.filteredRows = computed((): MaterialHistoryRowType[] => {
      const material: string | null = this.materialFilterSignal();
      const site: string | null = this.siteFilterSignal();
      const dateFrom: string | null = this.dateFromFilterSignal();
      const dateTo: string | null = this.dateToFilterSignal();

      return this.rowsSignal().filter((r): boolean => {
        const matchesMaterial: boolean = !material || r.material === material;
        const matchesSite: boolean = !site || r.sourceSite === site || r.destinationSite === site;
        const matchesFrom: boolean = !dateFrom || r.date >= dateFrom;
        const matchesTo: boolean = !dateTo || r.date <= dateTo;
        return matchesMaterial && matchesSite && matchesFrom && matchesTo;
      });
    });
    this.stats = computed((): StatType[] => {
      const rows: MaterialHistoryRowType[] = this.rowsSignal();
      return [
        { label: 'Movimientos registrados', value: rows.length },
        { label: 'Unidades trasladadas', value: rows.reduce((t, r): number => t + r.quantity, 0) },
        { label: 'Materiales distintos', value: this.materialOptions().length },
        { label: 'Obras involucradas', value: this.siteOptions().length }
      ];
    });

    this.loadRows();
  }

  protected onMaterialFilterChange(value: string | null): void {
    this.materialFilterSignal.set(value);
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

  protected remove(row: MaterialHistoryRowType): void {
    this.confirmationService
      .confirm(`¿Eliminar el movimiento de "${row.material}" (${row.sourceSite} → ${row.destinationSite}, ${row.date})? Las cantidades de inventario se recalcularán automáticamente.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<MutationResponseType> =>
          from(
            this.supabaseService.client
              .from(SUPABASE_TABLE_ENUMERATION.MATERIAL_MOVEMENTS)
              .delete()
              .eq('id', row.id)
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
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
        .from(SUPABASE_VIEW_ENUMERATION.MATERIAL_MOVEMENT_HISTORY)
        .select(
          'id, material, sourceSite:obra_origen, destinationSite:obra_destino, quantity:cantidad, deliveredBy:quien_entrega, receivedBy:quien_recibe, date:fecha, notes:observaciones'
        )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MaterialHistoryResponseType): void => {
        this.loadingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.rowsSignal.set(result.data ?? []);
      });
  }

  private uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b): number => a.localeCompare(b));
  }
}
