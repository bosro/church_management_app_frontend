
// src/app/shared/components/button/button.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
    standalone: false,
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [class]="buttonClasses"
      (click)="handleClick($event)"
    >
      <i *ngIf="icon && !loading" [class]="icon"></i>
      <app-loading-spinner *ngIf="loading" size="small"></app-loading-spinner>
      <span *ngIf="!loading">{{ label }}</span>
    </button>
  `,
  styles: [`
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Nunito Sans', sans-serif;
      width: 100%;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
    }

    .btn-primary {
      background: #5B21B6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #6D28D9;
    }

    .btn-secondary {
      background: #E5E7EB;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #D1D5DB;
    }

    .btn-danger {
      background: #DC2626;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #B91C1C;
    }

    .btn-outline {
      background: transparent;
      color: #5B21B6;
      border: 2px solid #5B21B6;
    }

    .btn-outline:hover:not(:disabled) {
      background: #5B21B6;
      color: white;
    }
  `]
})
export class Button {
  @Input() label: string = '';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() variant: 'primary' | 'secondary' | 'danger' | 'outline' = 'primary';
  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() icon?: string;
  @Output() clicked = new EventEmitter<Event>();

  get buttonClasses(): string {
    return `btn-${this.variant}`;
  }

  handleClick(event: Event): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
