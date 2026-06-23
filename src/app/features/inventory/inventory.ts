import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, filter, from, switchMap } from 'rxjs';

import {
  APP_ROUTE_ENUMERATION,
  ConfirmationService,
  NotificationService,
  POSTGRES_ERROR_CODE_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SUPABASE_VIEW_ENUMERATION,
  SupabaseService
} from '../../core';

interface SiteSummaryRowType {
  inventoryId: string;
  site: string;
  tool: string;
  currentQuantity: number;
  supervisor: string | null;
  lastMovement: string | null;
}

interface SiteSummaryResponseType {
  data: SiteSummaryRowType[] | null;
  error: PostgrestError | null;
}

interface CatalogItemType {
  id: string;
  name: string;
}

interface CatalogItemResponseType {
  data: CatalogItemType[] | null;
  error: PostgrestError | null;
}

interface MutationResponseType {
  error: PostgrestError | null;
}

@Component({
  selector: 'app-inventory',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule
  ],
  templateUrl: './inventory.html',
  styleUrl: './inventory.scss'
})
export class Inventory {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly confirmationService: ConfirmationService;
  private readonly destroyRef: DestroyRef;
  private readonly rowsSignal: WritableSignal<SiteSummaryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly supervisorsSignal: WritableSignal<CatalogItemType[]>;
  private readonly editingIdSignal: WritableSignal<string | null>;
  private readonly siteFilterSignal: WritableSignal<string | null>;
  private readonly toolFilterSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<SiteSummaryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly supervisors: Signal<CatalogItemType[]>;
  protected readonly editingId: Signal<string | null>;
  protected readonly editSupervisorControl: FormControl<string | null>;
  protected readonly siteFilter: Signal<string | null>;
  protected readonly toolFilter: Signal<string | null>;
  protected readonly siteOptions: Signal<string[]>;
  protected readonly toolOptions: Signal<string[]>;
  protected readonly filteredRows: Signal<SiteSummaryRowType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.confirmationService = inject(ConfirmationService);
    this.destroyRef = inject(DestroyRef);
    this.rowsSignal = signal<SiteSummaryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.supervisorsSignal = signal<CatalogItemType[]>([]);
    this.editingIdSignal = signal<string | null>(null);
    this.siteFilterSignal = signal<string | null>(null);
    this.toolFilterSignal = signal<string | null>(null);

    this.columns = ['site', 'tool', 'currentQuantity', 'supervisor', 'lastMovement', 'actions'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();
    this.editSupervisorControl = new FormControl<string | null>(null);
    this.siteFilter = this.siteFilterSignal.asReadonly();
    this.toolFilter = this.toolFilterSignal.asReadonly();

    this.siteOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((row): string => row.site)));
    this.toolOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((row): string => row.tool)));
    this.filteredRows = computed((): SiteSummaryRowType[] => {
      const site: string | null = this.siteFilterSignal();
      const tool: string | null = this.toolFilterSignal();

      return this.rowsSignal().filter(
        (row: SiteSummaryRowType): boolean => (!site || row.site === site) && (!tool || row.tool === tool)
      );
    });

    this.loadRows();
    this.loadSupervisors();
  }

  protected onSiteFilterChange(value: string | null): void {
    this.siteFilterSignal.set(value);
  }

  protected onToolFilterChange(value: string | null): void {
    this.toolFilterSignal.set(value);
  }

  protected startEditSupervisor(row: SiteSummaryRowType): void {
    this.editingIdSignal.set(row.inventoryId);
    this.editSupervisorControl.setValue(null);
  }

  protected cancelEditSupervisor(): void {
    this.editingIdSignal.set(null);
  }

  protected detailPath(row: SiteSummaryRowType): string {
    return `${APP_ROUTE_ENUMERATION.INVENTORY}/${row.inventoryId}`;
  }

  protected saveSupervisor(row: SiteSummaryRowType): void {
    const supervisorId: string | null = this.editSupervisorControl.value;

    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.INVENTORY)
        .update({ encargado_id: supervisorId })
        .eq('id', row.inventoryId)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.editingIdSignal.set(null);
        this.notificationService.success('Encargado actualizado correctamente.');
        this.loadRows();
      });
  }

  protected remove(row: SiteSummaryRowType): void {
    this.confirmationService
      .confirm(`¿Eliminar el registro de "${row.tool}" en "${row.site}"? Esta acción no se puede deshacer.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<MutationResponseType> =>
          from(
            this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.INVENTORY).delete().eq('id', row.inventoryId)
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.errorMessageSignal.set(
            result.error.code === POSTGRES_ERROR_CODE_ENUMERATION.FOREIGN_KEY_VIOLATION
              ? `No se puede eliminar "${row.tool}" en "${row.site}": tiene movimientos en el historial.`
              : result.error.message
          );
          return;
        }

        this.notificationService.success('Registro eliminado correctamente.');
        this.loadRows();
      });
  }

  private loadRows(): void {
    this.loadingSignal.set(true);

    from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.SITE_SUMMARY)
        .select(
          'inventoryId:inventario_obra_id, site:obra, tool:herramienta, currentQuantity:cantidad_actual, supervisor:encargado, lastMovement:ultimo_movimiento'
        )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: SiteSummaryResponseType): void => {
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

  private loadSupervisors(): void {
    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS)
        .select('id, name:nombre')
        .order('nombre')
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: CatalogItemResponseType): void => {
        this.supervisorsSignal.set(result.data ?? []);
      });
  }
}
