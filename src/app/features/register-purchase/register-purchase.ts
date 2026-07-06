import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import {
  NotificationService,
  SUPABASE_RPC_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner } from '../../shared';

interface CatalogItemType {
  id: string;
  name: string;
}

interface CatalogItemResponseType {
  data: CatalogItemType[] | null;
  error: PostgrestError | null;
}

interface RpcResponseType {
  error: PostgrestError | null;
}

interface RegisterPurchaseFormControlsType {
  itemId: FormControl<string>;
  destinationSiteId: FormControl<string>;
  quantity: FormControl<number>;
  date: FormControl<string>;
  notes: FormControl<string>;
}

interface RouteDataType {
  itemType: 'tool' | 'material';
  itemTable: SUPABASE_TABLE_ENUMERATION;
  itemLabel: string;
  rpc: SUPABASE_RPC_ENUMERATION;
}

@Component({
  selector: 'app-register-purchase',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    ErrorBanner
  ],
  templateUrl: './register-purchase.html',
  styleUrl: './register-purchase.scss'
})
export class RegisterPurchase {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly destroyRef: DestroyRef;
  private readonly itemsSignal: WritableSignal<CatalogItemType[]>;
  private readonly sitesSignal: WritableSignal<CatalogItemType[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly routeData: RouteDataType;
  protected readonly form: FormGroup<RegisterPurchaseFormControlsType>;
  protected readonly items: Signal<CatalogItemType[]>;
  protected readonly sites: Signal<CatalogItemType[]>;
  protected readonly loadingCatalogs: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.destroyRef = inject(DestroyRef);
    this.itemsSignal = signal<CatalogItemType[]>([]);
    this.sitesSignal = signal<CatalogItemType[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.items = this.itemsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.routeData = inject(ActivatedRoute).snapshot.data as RouteDataType;

    this.form = new FormGroup<RegisterPurchaseFormControlsType>({
      itemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      destinationSiteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      date: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
      notes: new FormControl('', { nonNullable: true })
    });

    this.loadCatalogs();
  }

  protected submit(formDirective: FormGroupDirective): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    const itemParam: string =
      this.routeData.itemType === 'tool' ? 'p_herramienta_id' : 'p_material_id';

    from(
      this.supabaseService.client.rpc(this.routeData.rpc, {
        [itemParam]: this.form.controls.itemId.value,
        p_obra_destino_id: this.form.controls.destinationSiteId.value,
        p_cantidad: this.form.controls.quantity.value,
        p_fecha: this.form.controls.date.value,
        p_observaciones: this.form.controls.notes.value || null
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: RpcResponseType): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.notificationService.success(
          `Compra de ${this.routeData.itemLabel.toLowerCase()} registrada correctamente.`
        );
        formDirective.resetForm({
          itemId: '',
          destinationSiteId: '',
          quantity: 1,
          date: this.today(),
          notes: ''
        });
      });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private loadCatalogs(): void {
    const items$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client
        .from(this.routeData.itemTable)
        .select('id, name:nombre')
        .order('nombre')
    );
    const sites$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SITES)
        .select('id, name:nombre')
        .order('nombre')
    );

    combineLatest([items$, sites$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([items, sites]): void => {
        this.loadingCatalogsSignal.set(false);

        if (items.error || sites.error) {
          this.errorMessageSignal.set('No se pudieron cargar los catálogos.');
          return;
        }

        this.itemsSignal.set(items.data ?? []);
        this.sitesSignal.set(sites.data ?? []);
      });
  }
}
