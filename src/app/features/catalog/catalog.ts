import { Component, DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
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
import { ErrorBanner } from '../../shared';

interface CatalogRouteDataType {
  table: SUPABASE_TABLE_ENUMERATION;
  summaryView?: SUPABASE_VIEW_ENUMERATION;
  label: string;
  singularLabel: string;
  hasQuantity?: boolean;
  hasBodega?: boolean;
  hasObservations?: boolean;
}

interface CatalogItemType {
  id: string;
  name: string;
  quantity?: number;
  inSites?: number;
  available?: number;
  isBodega?: boolean;
  observations?: string;
}

interface CatalogResponseType {
  data: CatalogItemType[] | null;
  error: PostgrestError | null;
}

interface MutationResponseType {
  error: PostgrestError | null;
}

interface NameFormControlsType {
  name: FormControl<string>;
}

@Component({
  selector: 'app-catalog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ErrorBanner
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss'
})
export class Catalog {
  private readonly supabaseService: SupabaseService;
  private readonly authService: AuthService;
  private readonly notificationService: NotificationService;
  private readonly confirmationService: ConfirmationService;
  private readonly destroyRef: DestroyRef;
  private readonly table: SUPABASE_TABLE_ENUMERATION;
  private readonly summaryView: SUPABASE_VIEW_ENUMERATION | null;
  private readonly itemsSignal: WritableSignal<CatalogItemType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly editingIdSignal: WritableSignal<string | null>;
  private readonly togglingBodegaIdSignal: WritableSignal<string | null>;

  protected readonly label: string;
  protected readonly singularLabel: string;
  protected readonly hasQuantity: boolean;
  protected readonly hasBodega: boolean;
  protected readonly hasObservations: boolean;
  protected readonly columns: Signal<string[]>;
  protected readonly canModify: Signal<boolean>;
  protected readonly items: Signal<CatalogItemType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly saving: Signal<boolean>;
  protected readonly editingId: Signal<string | null>;
  protected readonly togglingBodegaId: Signal<string | null>;
  protected readonly createForm: FormGroup<NameFormControlsType>;
  protected readonly editForm: FormGroup<NameFormControlsType>;
  protected readonly createQuantityControl: FormControl<number>;
  protected readonly editQuantityControl: FormControl<number>;
  protected readonly createObservationsControl: FormControl<string>;
  protected readonly editObservationsControl: FormControl<string>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.authService = inject(AuthService);
    this.notificationService = inject(NotificationService);
    this.confirmationService = inject(ConfirmationService);
    this.destroyRef = inject(DestroyRef);

    const routeData: CatalogRouteDataType = inject(ActivatedRoute).snapshot.data as CatalogRouteDataType;
    this.table = routeData.table;
    this.summaryView = routeData.summaryView ?? null;
    this.label = routeData.label;
    this.singularLabel = routeData.singularLabel;
    this.hasQuantity = routeData.hasQuantity ?? false;
    this.hasBodega = routeData.hasBodega ?? false;
    this.hasObservations = routeData.hasObservations ?? false;

    this.canModify = computed((): boolean => this.authService.role() !== APP_ROLE_ENUMERATION.WORKER);

    const baseColumns: string[] = this.hasQuantity
      ? ['name', 'quantity', 'inSites', 'available']
      : this.hasBodega
        ? ['name', 'bodega']
        : ['name'];

    this.columns = computed((): string[] =>
      this.canModify() ? [...baseColumns, 'actions'] : baseColumns
    );

    this.itemsSignal = signal<CatalogItemType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.savingSignal = signal<boolean>(false);
    this.editingIdSignal = signal<string | null>(null);
    this.togglingBodegaIdSignal = signal<string | null>(null);

    this.items = this.itemsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();
    this.togglingBodegaId = this.togglingBodegaIdSignal.asReadonly();

    this.createForm = new FormGroup<NameFormControlsType>({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
    this.editForm = new FormGroup<NameFormControlsType>({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
    this.createQuantityControl = new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] });
    this.editQuantityControl = new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] });
    this.createObservationsControl = new FormControl<string>('', { nonNullable: true });
    this.editObservationsControl = new FormControl<string>('', { nonNullable: true });

    this.loadItems();
  }

  protected create(formDirective: FormGroupDirective): void {
    if (this.createForm.invalid || this.savingSignal()) {
      return;
    }
    if (this.hasQuantity && this.createQuantityControl.invalid) {
      return;
    }

    const name: string = this.createForm.controls.name.value.trim();
    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    const payload: Record<string, unknown> = { nombre: name };
    if (this.hasQuantity) {
      payload['cantidad_total'] = this.createQuantityControl.value;
    }
    if (this.hasObservations) {
      payload['observaciones'] = this.createObservationsControl.value.trim() || null;
    }

    from(this.supabaseService.client.from(this.table).insert(payload))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, name));
          return;
        }

        this.notificationService.success(`Se agregó "${name}" correctamente.`);
        formDirective.resetForm({ name: '' });
        this.createQuantityControl.reset(0);
        this.createObservationsControl.reset('');
        this.loadItems();
      });
  }

  protected startEdit(item: CatalogItemType): void {
    this.editingIdSignal.set(item.id);
    this.editForm.reset({ name: item.name });
    this.editQuantityControl.reset(item.quantity ?? 0);
    this.editObservationsControl.reset(item.observations ?? '');
  }

  protected cancelEdit(): void {
    this.editingIdSignal.set(null);
  }

  protected saveEdit(item: CatalogItemType): void {
    if (this.editForm.invalid) {
      return;
    }
    if (this.hasQuantity && this.editQuantityControl.invalid) {
      return;
    }

    const name: string = this.editForm.controls.name.value.trim();
    const payload: Record<string, unknown> = { nombre: name };
    if (this.hasQuantity) {
      payload['cantidad_total'] = this.editQuantityControl.value;
    }
    if (this.hasObservations) {
      payload['observaciones'] = this.editObservationsControl.value.trim() || null;
    }

    from(this.supabaseService.client.from(this.table).update(payload).eq('id', item.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, name));
          return;
        }

        this.editingIdSignal.set(null);
        this.notificationService.success(`Se actualizó a "${name}" correctamente.`);
        this.loadItems();
      });
  }

  protected toggleBodega(item: CatalogItemType): void {
    this.togglingBodegaIdSignal.set(item.id);

    from(
      this.supabaseService.client
        .from(this.table)
        .update({ es_bodega: !item.isBodega })
        .eq('id', item.id)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        this.togglingBodegaIdSignal.set(null);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.loadItems();
      });
  }

  protected remove(item: CatalogItemType): void {
    this.confirmationService
      .confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)
      .pipe(
        filter((confirmed: boolean): boolean => confirmed),
        switchMap((): Observable<MutationResponseType> =>
          from(this.supabaseService.client.from(this.table).delete().eq('id', item.id))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result: MutationResponseType): void => {
        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, item.name));
          return;
        }

        this.notificationService.success(`Se eliminó "${item.name}" correctamente.`);
        this.loadItems();
      });
  }

  private friendlyError(error: PostgrestError, name: string): string {
    if (error.code === POSTGRES_ERROR_CODE_ENUMERATION.UNIQUE_VIOLATION) {
      return `Ya existe "${name}" en este catálogo.`;
    }

    if (error.code === POSTGRES_ERROR_CODE_ENUMERATION.FOREIGN_KEY_VIOLATION) {
      return `No se puede eliminar "${name}": está en uso en el inventario.`;
    }

    return error.message;
  }

  private loadItems(): void {
    this.loadingSignal.set(true);

    let selectFields = 'id, name:nombre';
    if (this.hasQuantity) {
      selectFields += ', quantity:cantidad_total, inSites:en_obras, available:disponible';
    }
    if (this.hasObservations) {
      selectFields += ', observations:observaciones';
    }
    if (this.hasBodega) {
      selectFields += ', isBodega:es_bodega';
    }

    const source: string = (this.hasQuantity && this.summaryView) ? this.summaryView : this.table;
    const pgQuery = this.summaryView && this.hasQuantity
      ? this.supabaseService.client.from(source).select(selectFields)
      : this.supabaseService.client.from(source).select(selectFields).order('nombre');
    const query$: Observable<CatalogResponseType> = from(pgQuery) as unknown as Observable<CatalogResponseType>;

    query$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result: CatalogResponseType): void => {
      this.loadingSignal.set(false);

      if (result.error) {
        this.errorMessageSignal.set(result.error.message);
        return;
      }

      this.itemsSignal.set(result.data ?? []);
    });
  }
}
