import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { filter, from, switchMap } from 'rxjs';

import {
  APP_ROUTE_ENUMERATION,
  NotificationService,
  SUPABASE_RPC_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner } from '../../shared';

interface MaterialItemType {
  id: string;
  name: string;
}

interface AvailableSiteType {
  obraId: string;
  name: string;
  currentQty: number;
}

interface MaterialCatalogResponseType {
  data: MaterialItemType[] | null;
  error: PostgrestError | null;
}

interface InventoryResponseType {
  data: { obra_id: string; cantidad_actual: number; obras: { nombre: string }[] }[] | null;
  error: PostgrestError | null;
}

interface RpcResponseType {
  error: PostgrestError | null;
}

interface RegisterConsumptionFormControlsType {
  materialId: FormControl<string>;
  siteId: FormControl<string>;
  quantity: FormControl<number>;
  date: FormControl<string>;
  notes: FormControl<string>;
}

@Component({
  selector: 'app-register-consumption',
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
  templateUrl: './register-consumption.html',
  styleUrl: './register-consumption.scss'
})
export class RegisterConsumption {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly router: Router;
  private readonly destroyRef: DestroyRef;
  private readonly materialsSignal: WritableSignal<MaterialItemType[]>;
  private readonly sitesSignal: WritableSignal<AvailableSiteType[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly loadingSitesSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<RegisterConsumptionFormControlsType>;
  protected readonly materials: Signal<MaterialItemType[]>;
  protected readonly sites: Signal<AvailableSiteType[]>;
  protected readonly loadingCatalogs: Signal<boolean>;
  protected readonly loadingSites: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.router = inject(Router);
    this.destroyRef = inject(DestroyRef);
    this.materialsSignal = signal<MaterialItemType[]>([]);
    this.sitesSignal = signal<AvailableSiteType[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.loadingSitesSignal = signal<boolean>(false);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.materials = this.materialsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.loadingSites = this.loadingSitesSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<RegisterConsumptionFormControlsType>({
      materialId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      siteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      date: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
      notes: new FormControl('', { nonNullable: true })
    });

    this.loadMaterials();
    this.watchMaterialChange();
  }

  protected submit(formDirective: FormGroupDirective): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    from(
      this.supabaseService.client.rpc(SUPABASE_RPC_ENUMERATION.REGISTER_CONSUMPTION, {
        p_material_id: this.form.controls.materialId.value,
        p_obra_origen_id: this.form.controls.siteId.value,
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

        this.notificationService.success('Consumo registrado correctamente.');
        this.router.navigate([APP_ROUTE_ENUMERATION.MATERIAL_INVENTORY]);
      });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private loadMaterials(): void {
    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.MATERIALS)
        .select('id, name:nombre')
        .order('nombre')
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MaterialCatalogResponseType): void => {
        this.loadingCatalogsSignal.set(false);
        if (!result.error) {
          this.materialsSignal.set(result.data ?? []);
        }
      });
  }

  private watchMaterialChange(): void {
    this.form.controls.materialId.valueChanges.pipe(
      filter((id): id is string => !!id),
      switchMap((id: string) => {
        this.sitesSignal.set([]);
        this.loadingSitesSignal.set(true);
        this.form.controls.siteId.reset('');
        return from(
          this.supabaseService.client
            .from(SUPABASE_TABLE_ENUMERATION.MATERIAL_INVENTORY)
            .select('obra_id, cantidad_actual, obras(nombre)')
            .eq('material_id', id)
            .gt('cantidad_actual', 0)
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result: InventoryResponseType): void => {
      this.loadingSitesSignal.set(false);
      if (!result.error && result.data) {
        this.sitesSignal.set(
          result.data
            .map((r): AvailableSiteType => ({
              obraId: r.obra_id,
              name: (r.obras as { nombre: string }[])[0]?.nombre ?? '',
              currentQty: r.cantidad_actual
            }))
            .sort((a, b): number => a.name.localeCompare(b.name))
        );
      }
    });
  }
}
