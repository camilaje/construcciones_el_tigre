import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, filter, from, switchMap } from 'rxjs';

import {
  APP_ROLE_ENUMERATION,
  AuthService,
  ConfirmationService,
  NotificationService,
  POSTGRES_ERROR_CODE_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SUPABASE_VIEW_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface MaterialInventoryRowType {
  inventoryId: string;
  site: string;
  material: string;
  currentQuantity: number;
  supervisor: string | null;
  lastMovement: string | null;
}

interface MaterialInventoryResponseType {
  data: MaterialInventoryRowType[] | null;
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

interface StatType {
  label: string;
  value: number;
}

@Component({
  selector: 'app-material-inventory',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    LoadingOverlay,
    ErrorBanner
  ],
  templateUrl: './material-inventory.html',
  styleUrl: './material-inventory.scss'
})
export class MaterialInventory {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly notificationService: NotificationService;
  private readonly confirmationService: ConfirmationService;
  private readonly destroyRef: DestroyRef;
  private readonly rowsSignal: WritableSignal<MaterialInventoryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly supervisorsSignal: WritableSignal<CatalogItemType[]>;
  private readonly editingIdSignal: WritableSignal<string | null>;
  private readonly siteFilterSignal: WritableSignal<string | null>;
  private readonly materialFilterSignal: WritableSignal<string | null>;

  protected readonly columns: Signal<string[]>;
  protected readonly canModify: Signal<boolean>;
  protected readonly rows: Signal<MaterialInventoryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly supervisors: Signal<CatalogItemType[]>;
  protected readonly editingId: Signal<string | null>;
  protected readonly editSupervisorControl: FormControl<string | null>;
  protected readonly siteFilter: Signal<string | null>;
  protected readonly materialFilter: Signal<string | null>;
  protected readonly siteOptions: Signal<string[]>;
  protected readonly materialOptions: Signal<string[]>;
  protected readonly filteredRows: Signal<MaterialInventoryRowType[]>;
  protected readonly stats: Signal<StatType[]>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.notificationService = inject(NotificationService);
    this.confirmationService = inject(ConfirmationService);
    this.destroyRef = inject(DestroyRef);
    this.rowsSignal = signal<MaterialInventoryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.supervisorsSignal = signal<CatalogItemType[]>([]);
    this.editingIdSignal = signal<string | null>(null);
    this.siteFilterSignal = signal<string | null>(null);
    this.materialFilterSignal = signal<string | null>(null);

    this.canModify = computed((): boolean => this.authService.role() !== APP_ROLE_ENUMERATION.WORKER);
    this.columns = computed((): string[] => {
      const base: string[] = ['site', 'material', 'currentQuantity', 'supervisor', 'lastMovement'];
      return this.canModify() ? [...base, 'actions'] : base;
    });
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();
    this.editSupervisorControl = new FormControl<string | null>(null);
    this.siteFilter = this.siteFilterSignal.asReadonly();
    this.materialFilter = this.materialFilterSignal.asReadonly();

    this.siteOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((r): string => r.site)));
    this.materialOptions = computed((): string[] => this.uniqueSorted(this.rowsSignal().map((r): string => r.material)));
    this.filteredRows = computed((): MaterialInventoryRowType[] => {
      const site: string | null = this.siteFilterSignal();
      const material: string | null = this.materialFilterSignal();
      return this.rowsSignal().filter(
        (r): boolean => (!site || r.site === site) && (!material || r.material === material)
      );
    });
    this.stats = computed((): StatType[] => {
      const rows: MaterialInventoryRowType[] = this.rowsSignal();
      return [
        { label: 'Combinaciones registradas', value: rows.length },
        { label: 'Unidades totales', value: rows.reduce((t, r): number => t + r.currentQuantity, 0) },
        { label: 'Obras con inventario', value: this.uniqueSorted(rows.map((r): string => r.site)).length },
        { label: 'Materiales distintos', value: this.uniqueSorted(rows.map((r): string => r.material)).length }
      ];
    });

    this.loadRows();
    this.loadSupervisors();
  }

  protected onSiteFilterChange(value: string | null): void {
    this.siteFilterSignal.set(value);
  }

  protected onMaterialFilterChange(value: string | null): void {
    this.materialFilterSignal.set(value);
  }

  protected startEditSupervisor(row: MaterialInventoryRowType): void {
    this.editingIdSignal.set(row.inventoryId);
    this.editSupervisorControl.setValue(null);
  }

  protected cancelEditSupervisor(): void {
    this.editingIdSignal.set(null);
  }

  protected saveSupervisor(row: MaterialInventoryRowType): void {
    const supervisorId: string | null = this.editSupervisorControl.value;
    this.loadingSignal.set(true);

    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.MATERIAL_INVENTORY)
        .update({ encargado_id: supervisorId })
        .eq('id', row.inventoryId)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.loadingSignal.set(false);
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.editingIdSignal.set(null);
        this.notificationService.success('Encargado actualizado correctamente.');
        this.loadRows();
      });
  }

  protected remove(row: MaterialInventoryRowType): void {
    this.confirmationService
      .confirm(`¿Eliminar el registro de "${row.material}" en "${row.site}"? Esta acción no se puede deshacer.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<MutationResponseType> => {
          this.loadingSignal.set(true);
          return from(
            this.supabaseService.client
              .from(SUPABASE_TABLE_ENUMERATION.MATERIAL_INVENTORY)
              .delete()
              .eq('id', row.inventoryId)
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.loadingSignal.set(false);
          this.errorMessageSignal.set(
            result.error.code === POSTGRES_ERROR_CODE_ENUMERATION.FOREIGN_KEY_VIOLATION
              ? `"${row.material}" en "${row.site}" tiene movimientos asociados. Elimínalos primero desde Historial y luego podrás borrar este registro.`
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
        .from(SUPABASE_VIEW_ENUMERATION.MATERIAL_SITE_SUMMARY)
        .select(
          'inventoryId:inventario_material_id, site:obra, material, currentQuantity:cantidad_actual, supervisor:encargado, lastMovement:ultimo_movimiento'
        )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MaterialInventoryResponseType): void => {
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
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
