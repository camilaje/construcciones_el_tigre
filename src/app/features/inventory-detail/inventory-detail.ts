import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, from, map, of, switchMap, tap } from 'rxjs';

import { APP_ROUTE_ENUMERATION, SUPABASE_VIEW_ENUMERATION, SupabaseService } from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

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

interface DetailMovementResponseType {
  data: DetailMovementRowType[] | null;
  error: PostgrestError | null;
}

interface DetailLoadResultType {
  header: DetailHeaderType | null;
  movements: DetailMovementRowType[];
  error: string | null;
}

@Component({
  selector: 'app-inventory-detail',
  imports: [RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, LoadingOverlay, ErrorBanner],
  templateUrl: './inventory-detail.html',
  styleUrl: './inventory-detail.scss'
})
export class InventoryDetail {
  private readonly supabaseService: SupabaseService;
  private readonly destroyRef: DestroyRef;
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
    this.destroyRef = inject(DestroyRef);
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

    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params: ParamMap): string => params.get('id') ?? ''),
        tap((): void => this.loadingSignal.set(true)),
        switchMap((inventoryId: string): Observable<DetailHeaderResponseType> => this.fetchHeader(inventoryId)),
        switchMap((headerResult: DetailHeaderResponseType): Observable<DetailLoadResultType> =>
          this.fetchMovementsFor(headerResult)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: DetailLoadResultType): void => {
        this.loadingSignal.set(false);
        this.headerSignal.set(result.header);
        this.movementsSignal.set(result.movements);
        this.errorMessageSignal.set(result.error);
      });
  }

  private fetchHeader(inventoryId: string): Observable<DetailHeaderResponseType> {
    return from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.SITE_SUMMARY)
        .select('site:obra, tool:herramienta, currentQuantity:cantidad_actual, supervisor:encargado')
        .eq('inventario_obra_id', inventoryId)
        .maybeSingle()
    );
  }

  private fetchMovementsFor(headerResult: DetailHeaderResponseType): Observable<DetailLoadResultType> {
    if (headerResult.error || !headerResult.data) {
      return of({ header: null, movements: [], error: headerResult.error?.message ?? null });
    }

    const header: DetailHeaderType = headerResult.data;

    return from(
      this.supabaseService.client
        .from(SUPABASE_VIEW_ENUMERATION.MOVEMENT_HISTORY)
        .select(
          'id, type:tipo, tool:herramienta, sourceSite:obra_origen, destinationSite:obra_destino, quantity:cantidad, deliveredBy:quien_entrega, receivedBy:quien_recibe, date:fecha, notes:observaciones, reason:motivo'
        )
        .eq('herramienta', header.tool)
    ).pipe(
      map((movementsResult: DetailMovementResponseType): DetailLoadResultType => ({
        header,
        movements: (movementsResult.data ?? []).filter(
          (row: DetailMovementRowType): boolean => row.sourceSite === header.site || row.destinationSite === header.site
        ),
        error: movementsResult.error?.message ?? null
      }))
    );
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
