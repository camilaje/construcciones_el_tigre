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
import { PostgrestError } from '@supabase/supabase-js';
import { filter, from, switchMap } from 'rxjs';

import {
  APP_ROUTE_ENUMERATION,
  NotificationService,
  SUPABASE_RPC_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface ToolItemType {
  id: string;
  name: string;
}

interface AvailableSiteType {
  obraId: string;
  name: string;
  currentQty: number;
}

interface ToolCatalogResponseType {
  data: ToolItemType[] | null;
  error: PostgrestError | null;
}

interface InventoryResponseType {
  data: { obra_id: string; cantidad_actual: number; obras: { nombre: string }[] }[] | null;
  error: PostgrestError | null;
}

interface RpcResponseType {
  error: PostgrestError | null;
}

interface RegisterWriteoffFormControlsType {
  toolId: FormControl<string>;
  siteId: FormControl<string>;
  quantity: FormControl<number>;
  reason: FormControl<string>;
  date: FormControl<string>;
  notes: FormControl<string>;
}

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'daño', label: 'Dañada' },
  { value: 'pérdida', label: 'Perdida' },
  { value: 'obsolescencia', label: 'Obsoleta' }
];

@Component({
  selector: 'app-register-writeoff',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    LoadingOverlay,
    ErrorBanner
  ],
  templateUrl: './register-writeoff.html',
  styleUrl: './register-writeoff.scss'
})
export class RegisterWriteoff {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly router: Router;
  private readonly destroyRef: DestroyRef;
  private readonly toolsSignal: WritableSignal<ToolItemType[]>;
  private readonly sitesSignal: WritableSignal<AvailableSiteType[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly loadingSitesSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly reasonOptions: { value: string; label: string }[] = REASON_OPTIONS;
  protected readonly form: FormGroup<RegisterWriteoffFormControlsType>;
  protected readonly tools: Signal<ToolItemType[]>;
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
    this.toolsSignal = signal<ToolItemType[]>([]);
    this.sitesSignal = signal<AvailableSiteType[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.loadingSitesSignal = signal<boolean>(false);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.tools = this.toolsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.loadingSites = this.loadingSitesSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<RegisterWriteoffFormControlsType>({
      toolId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      siteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      reason: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      date: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
      notes: new FormControl('', { nonNullable: true })
    });

    this.loadTools();
    this.watchToolChange();
  }

  protected submit(formDirective: FormGroupDirective): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    from(
      this.supabaseService.client.rpc(SUPABASE_RPC_ENUMERATION.REGISTER_WRITEOFF, {
        p_herramienta_id: this.form.controls.toolId.value,
        p_obra_origen_id: this.form.controls.siteId.value,
        p_cantidad: this.form.controls.quantity.value,
        p_motivo: this.form.controls.reason.value,
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

        this.notificationService.success('Baja registrada correctamente.');
        this.router.navigate([APP_ROUTE_ENUMERATION.INVENTORY]);
      });
  }

  private today(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  private loadTools(): void {
    from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.TOOLS)
        .select('id, name:nombre')
        .order('nombre')
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: ToolCatalogResponseType): void => {
        this.loadingCatalogsSignal.set(false);
        if (!result.error) {
          this.toolsSignal.set(result.data ?? []);
        }
      });
  }

  private watchToolChange(): void {
    this.form.controls.toolId.valueChanges.pipe(
      filter((id): id is string => !!id),
      switchMap((id: string) => {
        this.sitesSignal.set([]);
        this.loadingSitesSignal.set(true);
        this.form.controls.siteId.reset('');
        return from(
          this.supabaseService.client
            .from(SUPABASE_TABLE_ENUMERATION.INVENTORY)
            .select('obra_id, cantidad_actual, obras(nombre)')
            .eq('herramienta_id', id)
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
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
