import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { APP_ROUTE_ENUMERATION } from '../../core/app-route';
import { POSTGRES_ERROR_CODE_ENUMERATION, SUPABASE_TABLE_ENUMERATION, SUPABASE_VIEW_ENUMERATION } from '../../core/supabase-schema';

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
    MatSelectModule
  ],
  templateUrl: './inventory.html',
  styleUrl: './inventory.scss'
})
export class Inventory {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly rowsSignal: WritableSignal<SiteSummaryRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly supervisorsSignal: WritableSignal<CatalogItemType[]>;
  private readonly editingIdSignal: WritableSignal<string | null>;

  protected readonly columns: string[];
  protected readonly rows: Signal<SiteSummaryRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly supervisors: Signal<CatalogItemType[]>;
  protected readonly editingId: Signal<string | null>;
  protected readonly editSupervisorControl: FormControl<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.rowsSignal = signal<SiteSummaryRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.supervisorsSignal = signal<CatalogItemType[]>([]);
    this.editingIdSignal = signal<string | null>(null);

    this.columns = ['site', 'tool', 'currentQuantity', 'supervisor', 'lastMovement', 'actions'];
    this.rows = this.rowsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();
    this.editSupervisorControl = new FormControl<string | null>(null);

    this.loadRows();
    this.loadSupervisors();
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
    ).subscribe((result: MutationResponseType): void => {
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
    if (!confirm(`¿Eliminar el registro de "${row.tool}" en "${row.site}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.INVENTORY).delete().eq('id', row.inventoryId)
    ).subscribe((result: MutationResponseType): void => {
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
    ).subscribe((result: SiteSummaryResponseType): void => {
      this.loadingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      this.rowsSignal.set(result.data ?? []);
    });
  }

  private loadSupervisors(): void {
    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS)
        .select('id, name:nombre')
        .order('nombre')
    ).subscribe((result: CatalogItemResponseType): void => {
      this.supervisorsSignal.set(result.data ?? []);
    });
  }
}
