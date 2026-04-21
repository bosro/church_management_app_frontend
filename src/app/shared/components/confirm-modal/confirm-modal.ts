
// src/app/shared/components/confirm-modal/confirm-modal.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';

export type ModalVariant = 'danger' | 'warning' | 'info';

@Component({
 selector: 'app-confirm-modal',
  standalone: false,
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModal {
  @Input() show = false;
  @Input() title = 'Are you sure?';
  @Input() message = '';
  @Input() submessage = '';
  @Input() warningText = '';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() variant: ModalVariant = 'danger';
  @Input() loading = false;
  @Input() icon = '';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  get iconClass(): string {
    if (this.icon) return this.icon;
    const map: Record<ModalVariant, string> = {
      danger: 'ri-delete-bin-line',
      warning: 'ri-alert-line',
      info: 'ri-information-line',
    };
    return map[this.variant];
  }

  get confirmButtonClass(): string {
    const map: Record<ModalVariant, string> = {
      danger: 'btn-confirm-danger',
      warning: 'btn-confirm-warning',
      info: 'btn-confirm-primary',
    };
    return map[this.variant];
  }

  onConfirm(): void {
    if (!this.loading) this.confirmed.emit();
  }

  onCancel(): void {
    if (!this.loading) this.cancelled.emit();
  }

  onOverlayClick(): void {
    if (!this.loading) this.cancelled.emit();
  }
}
