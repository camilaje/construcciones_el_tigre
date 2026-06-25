import { Component, DestroyRef, Signal, WritableSignal, inject, signal } from '@angular/core';
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
import { PostgrestError } from '@supabase/supabase-js';
import { Observable, filter, from, switchMap } from 'rxjs';

import {
  ConfirmationService,
  NotificationService,
  POSTGRES_ERROR_CODE_ENUMERATION,
  SUPABASE_TABLE_ENUMERATION,
  SupabaseService
} from '../../core';
import { ErrorBanner } from '../../shared';

interface CatalogRouteDataType {
  table: SUPABASE_TABLE_ENUMERATION;
  label: string;
  singularLabel: string;
}

interface CatalogItemType {
  id: string;
  name: string;
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
    ErrorBanner
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss'
})
export class Catalog {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly confirmationService: ConfirmationService;
  private readonly destroyRef: DestroyRef;
  private readonly table: SUPABASE_TABLE_ENUMERATION;
  private readonly itemsSignal: WritableSignal<CatalogItemType[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly editingIdSignal: WritableSignal<string | null>;

  protected readonly label: string;
  protected readonly singularLabel: string;
  protected readonly columns: string[];
  protected readonly items: Signal<CatalogItemType[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly saving: Signal<boolean>;
  protected readonly editingId: Signal<string | null>;
  protected readonly createForm: FormGroup<NameFormControlsType>;
  protected readonly editForm: FormGroup<NameFormControlsType>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);
    this.confirmationService = inject(ConfirmationService);
    this.destroyRef = inject(DestroyRef);

    const routeData: CatalogRouteDataType = inject(ActivatedRoute).snapshot.data as CatalogRouteDataType;
    this.table = routeData.table;
    this.label = routeData.label;
    this.singularLabel = routeData.singularLabel;
    this.columns = ['name', 'actions'];

    this.itemsSignal = signal<CatalogItemType[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.savingSignal = signal<boolean>(false);
    this.editingIdSignal = signal<string | null>(null);

    this.items = this.itemsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();

    this.createForm = new FormGroup<NameFormControlsType>({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
    this.editForm = new FormGroup<NameFormControlsType>({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });

    this.loadItems();
  }

  protected create(formDirective: FormGroupDirective): void {
    if (this.createForm.invalid || this.savingSignal()) {
      return;
    }

    const name: string = this.createForm.controls.name.value.trim();
    this.savingSignal.set(true);
    this.errorMessageSignal.set(null);

    from(this.supabaseService.client.from(this.table).insert({ nombre: name }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: MutationResponseType): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, name));
          return;
        }

        this.notificationService.success(`Se agregó "${name}" correctamente.`);
        formDirective.resetForm({ name: '' });
        this.loadItems();
      });
  }

  protected startEdit(item: CatalogItemType): void {
    this.editingIdSignal.set(item.id);
    this.editForm.reset({ name: item.name });
  }

  protected cancelEdit(): void {
    this.editingIdSignal.set(null);
  }

  protected saveEdit(item: CatalogItemType): void {
    if (this.editForm.invalid) {
      return;
    }

    const name: string = this.editForm.controls.name.value.trim();

    from(this.supabaseService.client.from(this.table).update({ nombre: name }).eq('id', item.id))
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

    from(this.supabaseService.client.from(this.table).select('id, name:nombre').order('nombre'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: CatalogResponseType): void => {
        this.loadingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.itemsSignal.set(result.data ?? []);
      });
  }
}
