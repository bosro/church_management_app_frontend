
// src/app/shared/components/unauthorized/unauthorized.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
    standalone: false,
  template: `
    <div class="unauthorized-container">
      <div class="unauthorized-content">
        <i class="ri-error-warning-line error-icon"></i>
        <h1>Access Denied</h1>
        <p>You don't have permission to access this page.</p>
        <p class="description">
          If you believe you should have access, please contact your administrator.
        </p>
        <div class="actions">
          <button class="btn-primary" (click)="goBack()">
            <i class="ri-arrow-left-line"></i>
            Go Back
          </button>
          <button class="btn-secondary" (click)="goToDashboard()">
            <i class="ri-home-line"></i>
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .unauthorized-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F9FAFB;
      padding: 20px;
    }

    .unauthorized-content {
      text-align: center;
      max-width: 500px;
    }

    .error-icon {
      font-size: 80px;
      color: #EF4444;
      margin-bottom: 24px;
    }

    h1 {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 16px 0;
    }

    p {
      font-size: 16px;
      color: #6B7280;
      margin: 0 0 8px 0;
    }

    .description {
      margin-bottom: 32px;
    }

    .actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      &.btn-primary {
        background: #7C3AED;
        color: white;

        &:hover {
          background: #6D28D9;
        }
      }

      &.btn-secondary {
        background: white;
        color: #374151;
        border: 1px solid #E5E7EB;

        &:hover {
          background: #F9FAFB;
        }
      }
    }

    @media (max-width: 480px) {
      .actions {
        flex-direction: column;
        width: 100%;

        button {
          width: 100%;
          justify-content: center;
        }
      }
    }
  `]
})
export class Unauthorized {
  constructor(private router: Router) {}

  goBack(): void {
    window.history.back();
  }

  goToDashboard(): void {
    this.router.navigate(['/main/dashboard']);
  }
}
