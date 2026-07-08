import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, combineLatest, from } from 'rxjs';

import {
  NotificationService,
  SUPABASE_RPC_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner, LoadingOverlay } from '../../shared';

interface CatalogItemType {
  id: string;
  name: string;
}

interface CatalogItemResponseType {
  data: CatalogItemType[] | null;
  error: PostgrestError | null;
}

interface TransferRpcResponseType {
  error: PostgrestError | null;
}

interface RegisterMovementFormControlsType {
  toolId: FormControl<string>;
  sourceSiteId: FormControl<string>;
  destinationSiteId: FormControl<string>;
  quantity: FormControl<number>;
  deliveredById: FormControl<string | null>;
  receivedById: FormControl<string | null>;
  date: FormControl<string>;
  notes: FormControl<string>;
}

@Component({
  selector: 'app-register-movement',
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
  templateUrl: './register-movement.html',
  styleUrl: './register-movement.scss'
})
export class RegisterMovement {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly destroyRef: DestroyRef;
  private readonly toolsSignal: WritableSignal<CatalogItemType[]>;
  private readonly sitesSignal: WritableSignal<CatalogItemType[]>;
  private readonly supervisorsSignal: WritableSignal<CatalogItemType[]>;
  private readonly loadingCatalogsSignal: WritableSignal<boolean>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;

  protected readonly form: FormGroup<RegisterMovementFormControlsType>;
  protected readonly tools: Signal<CatalogItemType[]>;
  protected readonly sites: Signal<CatalogItemType[]>;
  protected readonly supervisors: Signal<CatalogItemType[]>;
  protected readonly loadingCatalogs: Signal<boolean>;
  protected readonly saving: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.destroyRef = inject(DestroyRef);
    this.toolsSignal = signal<CatalogItemType[]>([]);
    this.sitesSignal = signal<CatalogItemType[]>([]);
    this.supervisorsSignal = signal<CatalogItemType[]>([]);
    this.loadingCatalogsSignal = signal<boolean>(true);
    this.savingSignal = signal<boolean>(false);
    this.errorMessageSignal = signal<string | null>(null);

    this.tools = this.toolsSignal.asReadonly();
    this.sites = this.sitesSignal.asReadonly();
    this.supervisors = this.supervisorsSignal.asReadonly();
    this.loadingCatalogs = this.loadingCatalogsSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();

    this.form = new FormGroup<RegisterMovementFormControlsType>(
      {
        toolId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        sourceSiteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        destinationSiteId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
        deliveredById: new FormControl<string | null>(null),
        receivedById: new FormControl<string | null>(null),
        date: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
        notes: new FormControl('', { nonNullable: true })
      },
      { validators: [this.validateDifferentSites] }
    );

    this.loadCatalogs();
  }

  protected submit(formDirective: FormGroupDirective): void {
    if (this.form.invalid || this.savingSignal()) {
      return;
    }

    const toolId: string = this.form.controls.toolId.value;
    const sourceSiteId: string = this.form.controls.sourceSiteId.value;
    const destinationSiteId: string = this.form.controls.destinationSiteId.value;
    const quantity: number = this.form.controls.quantity.value;
    const deliveredById: string | null = this.form.controls.deliveredById.value;
    const receivedById: string | null = this.form.controls.receivedById.value;
    const date: string = this.form.controls.date.value;
    const notes: string = this.form.controls.notes.value;

    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    from(
      this.supabaseService.client.rpc(SUPABASE_RPC_ENUMERATION.TRANSFER_TOOL, {
        p_herramienta_id: toolId,
        p_obra_origen_id: sourceSiteId,
        p_obra_destino_id: destinationSiteId,
        p_cantidad: quantity,
        p_quien_entrega_id: deliveredById,
        p_quien_recibe_id: receivedById,
        p_fecha: date,
        p_observaciones: notes || null
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: TransferRpcResponseType): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.notificationService.success('Traslado registrado correctamente.');
        formDirective.resetForm({
          toolId: '',
          sourceSiteId: '',
          destinationSiteId: '',
          quantity: 1,
          deliveredById: null,
          receivedById: null,
          date: this.today(),
          notes: ''
        });
      });
  }

  protected sameSiteErrorMessage(): string | null {
    return this.form.errors?.['sameSite'] ? 'La obra de origen y destino deben ser diferentes.' : null;
  }

  private validateDifferentSites(group: AbstractControl): ValidationErrors | null {
    const source: string = group.get('sourceSiteId')?.value;
    const destination: string = group.get('destinationSiteId')?.value;
    return source && destination && source === destination ? { sameSite: true } : null;
  }

  private today(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  private loadCatalogs(): void {
    const tools$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.TOOLS).select('id, name:nombre').order('nombre')
    );
    const sites$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client.from(SUPABASE_TABLE_ENUMERATION.SITES).select('id, name:nombre').order('nombre')
    );
    const supervisors$: Observable<CatalogItemResponseType> = from(
      this.supabaseService.client
        .from(SUPABASE_TABLE_ENUMERATION.SUPERVISORS)
        .select('id, name:nombre')
        .order('nombre')
    );

    combineLatest([tools$, sites$, supervisors$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        ([tools, sites, supervisors]: [
          CatalogItemResponseType,
          CatalogItemResponseType,
          CatalogItemResponseType
        ]): void => {
          this.loadingCatalogsSignal.set(false);

          if (tools.error || sites.error || supervisors.error) {
            this.errorMessageSignal.set('No se pudieron cargar los catálogos.');
            return;
          }

          this.toolsSignal.set(tools.data ?? []);
          this.sitesSignal.set(sites.data ?? []);
          this.supervisorsSignal.set(supervisors.data ?? []);
        }
      );
  }
  protected clearError(): void {
    this.errorMessageSignal.set(null);
  }

}
