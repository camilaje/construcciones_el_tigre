import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { APP_ROUTE_ENUMERATION, SUPABASE_VIEW_ENUMERATION, SupabaseService } from '../../core';

interface DetailHeaderType {
  tool: string;
  site: string;
  currentQuantity: number;
  supervisor: string | null;
}

interface DetailHeaderResponseType {
  data: DetailHeaderType | null;
  error: PostgrestError | null;
}

interface DetailMovementRowType {
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

interface DetailMovementResponseType {
  data: DetailMovementRowType[] | null;
  error: PostgrestError | null;
}

@Component({
  selector: 'app-inventory-detail',
  imports: [RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './inventory-detail.html',
  styleUrl: './inventory-detail.scss'
})
export class InventoryDetail {
  private readonly supabaseService: SupabaseService;
  private readonly headerSignal: WritableSignal<DetailHeaderType | null>;
  private readonly movementsSignal: WritableSignal<DetailMovementRowType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly appRoute: typeof APP_ROUTE_ENUMERATION;
  protected readonly columns: string[];
  protected readonly header: Signal<DetailHeaderType | null>;
  protected readonly movements: Signal<DetailMovementRowType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.headerSignal = signal<DetailHeaderType | null>(null);
    this.movementsSignal = signal<DetailMovementRowType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);

    this.appRoute = APP_ROUTE_ENUMERATION;
    this.columns = ['date', 'route', 'quantity', 'deliveredBy', 'receivedBy', 'notes'];
    this.header = this.headerSignal.asReadonly();
    this.movements = this.movementsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    inject(ActivatedRoute).paramMap.subscribe((params: ParamMap): void => {
      const inventoryId: string = params.get('id') ?? '';
      this.loadHeader(inventoryId);
    });
  }

  private loadHeader(inventoryId: string): void {
    this.loadingSignal.set(true);

    from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.SITE_SUMMARY)
        .select('site:obra, tool:herramienta, currentQuantity:cantidad_actual, supervisor:encargado')
        .eq('inventario_obra_id', inventoryId)
        .maybeSingle()
    ).subscribe((result: DetailHeaderResponseType): void => {
      if (result.error) {
        this.loadingSignal.set(false);
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      this.headerSignal.set(result.data);

      if (result.data) {
        this.loadMovements(result.data.tool, result.data.site);
      } else {
        this.loadingSignal.set(false);
      }
    });
  }

  private loadMovements(tool: string, site: string): void {
    from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.MOVEMENT_HISTORY)
        .select(
          'id, tool:herramienta, sourceSite:obra_origen, destinationSite:obra_destino, quantity:cantidad, deliveredBy:quien_entrega, receivedBy:quien_recibe, date:fecha, notes:observaciones'
        )
        .eq('herramienta', tool)
    ).subscribe((result: DetailMovementResponseType): void => {
      this.loadingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      const rows: DetailMovementRowType[] = result.data ?? [];
      this.movementsSignal.set(
        rows.filter((row: DetailMovementRowType): boolean => row.sourceSite === site || row.destinationSite === site)
      );
    });
  }
}
