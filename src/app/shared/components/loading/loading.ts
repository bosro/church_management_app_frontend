
// src/app/shared/components/loading-spinner/loading-spinner.component.ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
   standalone: false,

  template: `
    <div class="loading-spinner" [class.small]="size === 'small'" [class.large]="size === 'large'">
      <div class="spinner"></div>
      <p *ngIf="message" class="message">{{ message }}</p>
    </div>
  `,
  styles: [`
    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #E5E7EB;
      border-top-color: #5B21B6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .loading-spinner.small .spinner {
      width: 24px;
      height: 24px;
      border-width: 3px;
    }

    .loading-spinner.large .spinner {
      width: 60px;
      height: 60px;
      border-width: 5px;
    }

    .message {
      margin-top: 1rem;
      color: #6B7280;
      font-size: 14px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `]
})
export class Loading {
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() message?: string;
}
