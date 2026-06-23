import { Component, Signal, WritableSignal, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostgrestError } from '@supabase/supabase-js';
import { from } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';

interface CatalogRouteData {
  table: string;
  label: string;
  singularLabel: string;
}

interface CatalogItem {
  id: string;
  name: string;
}

interface CatalogResponse {
  data: CatalogItem[] | null;
  error: PostgrestError | null;
}

interface MutationResponse {
  error: PostgrestError | null;
}

interface NameFormControls {
  name: FormControl<string>;
}

@Component({
  selector: 'app-catalog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss'
})
export class Catalog {
  private readonly supabaseService: SupabaseService;
  private readonly notificationService: NotificationService;
  private readonly table: string;
  private readonly itemsSignal: WritableSignal<CatalogItem[]>;
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly errorMessageSignal: WritableSignal<string | null>;
  private readonly savingSignal: WritableSignal<boolean>;
  private readonly editingIdSignal: WritableSignal<string | null>;

  protected readonly label: string;
  protected readonly singularLabel: string;
  protected readonly items: Signal<CatalogItem[]>;
  protected readonly loading: Signal<boolean>;
  protected readonly errorMessage: Signal<string | null>;
  protected readonly saving: Signal<boolean>;
  protected readonly editingId: Signal<string | null>;
  protected readonly createForm: FormGroup<NameFormControls>;
  protected readonly editForm: FormGroup<NameFormControls>;

  constructor() {
    this.supabaseService = inject(SupabaseService);
    this.notificationService = inject(NotificationService);

    const routeData: CatalogRouteData = inject(ActivatedRoute).snapshot.data as CatalogRouteData;
    this.table = routeData.table;
    this.label = routeData.label;
    this.singularLabel = routeData.singularLabel;

    this.itemsSignal = signal<CatalogItem[]>([]);
    this.loadingSignal = signal<boolean>(true);
    this.errorMessageSignal = signal<string | null>(null);
    this.savingSignal = signal<boolean>(false);
    this.editingIdSignal = signal<string | null>(null);

    this.items = this.itemsSignal.asReadonly();
    this.loading = this.loadingSignal.asReadonly();
    this.errorMessage = this.errorMessageSignal.asReadonly();
    this.saving = this.savingSignal.asReadonly();
    this.editingId = this.editingIdSignal.asReadonly();

    this.createForm = new FormGroup<NameFormControls>({
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    });
    this.editForm = new FormGroup<NameFormControls>({
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

    from(this.supabaseService.client.from(this.table).insert({ nombre: name })).subscribe(
      (result: MutationResponse): void => {
        this.savingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, name));
          return;
        }

        this.notificationService.success(`Se agregó "${name}" correctamente.`);
        formDirective.resetForm({ name: '' });
        this.loadItems();
      }
    );
  }

  protected startEdit(item: CatalogItem): void {
    this.editingIdSignal.set(item.id);
    this.editForm.reset({ name: item.name });
  }

  protected cancelEdit(): void {
    this.editingIdSignal.set(null);
  }

  protected saveEdit(item: CatalogItem): void {
    if (this.editForm.invalid) {
      return;
    }

    const name: string = this.editForm.controls.name.value.trim();

    from(this.supabaseService.client.from(this.table).update({ nombre: name }).eq('id', item.id)).subscribe(
      (result: MutationResponse): void => {
        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, name));
          return;
        }

        this.editingIdSignal.set(null);
        this.notificationService.success(`Se actualizó a "${name}" correctamente.`);
        this.loadItems();
      }
    );
  }

  protected remove(item: CatalogItem): void {
    if (!confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    from(this.supabaseService.client.from(this.table).delete().eq('id', item.id)).subscribe(
      (result: MutationResponse): void => {
        if (result.error) {
          this.errorMessageSignal.set(this.friendlyError(result.error, item.name));
          return;
        }

        this.notificationService.success(`Se eliminó "${item.name}" correctamente.`);
        this.loadItems();
      }
    );
  }

  private friendlyError(error: PostgrestError, name: string): string {
    if (error.code === '23505') {
      return `Ya existe "${name}" en este catálogo.`;
    }

    if (error.code === '23503') {
      return `No se puede eliminar "${name}": está en uso en el inventario.`;
    }

    return error.message;
  }

  private loadItems(): void {
    this.loadingSignal.set(true);

    from(this.supabaseService.client.from(this.table).select('id, name:nombre').order('nombre')).subscribe(
      (result: CatalogResponse): void => {
        this.loadingSignal.set(false);

        if (result.error) {
          this.errorMessageSignal.set(result.error.message);
          return;
        }

        this.itemsSignal.set(result.data ?? []);
      }
    );
  }
}
