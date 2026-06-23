import { Injectable } from '@angular/core';
import Swal, { SweetAlertResult } from 'sweetalert2';
import { Observable, from, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  public confirm(message: string): Observable<boolean> {
    return from(
      Swal.fire({
        text: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b0492e',
        reverseButtons: true
      })
    ).pipe(map((result: SweetAlertResult<unknown>): boolean => result.isConfirmed));
  }
}
