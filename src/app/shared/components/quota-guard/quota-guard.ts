
// src/app/shared/components/quota-guard/quota-guard.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { QuotaCheck, SubscriptionService } from '../../../core/services/subscription.service';

@Component({
  selector: 'app-quota-guard',
  standalone: false,
  template: `
    <div *ngIf="quotaCheck && !quotaCheck.allowed" class="quota-warning">
      <div class="quota-banner">
        <div class="quota-info">
          <i class="ri-lock-line"></i>
          <div>
            <p class="quota-title">{{ getTitle() }}</p>
            <p class="quota-sub">
              {{ quotaCheck.current }} / {{ quotaCheck.limit }} used
              on your {{ quotaCheck.tier }} plan
            </p>
          </div>
        </div>
        <button class="btn-upgrade" (click)="onUpgrade()">
          <i class="ri-arrow-up-circle-line"></i>
          Upgrade Plan
        </button>
      </div>
      <!-- Progress bar -->
      <div class="quota-progress">
        <div class="quota-progress-fill"
             [style.width.%]="getPercent()"
             [class.critical]="getPercent() >= 100">
        </div>
      </div>
    </div>

    <!-- Show content only if quota allows -->
    <ng-content *ngIf="!quotaCheck || quotaCheck.allowed"></ng-content>
  `,
  styles: [`
    .quota-warning { margin-bottom: 1.5rem; }
    .quota-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      background: #FEF3C7;
      border: 1px solid #FDE68A;
      border-radius: 8px 8px 0 0;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .quota-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      i { font-size: 1.5rem; color: #D97706; }
    }
    .quota-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #92400E;
      margin: 0 0 0.25rem 0;
    }
    .quota-sub {
      font-size: 0.8125rem;
      color: #B45309;
      margin: 0;
    }
    .btn-upgrade {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      background: #D97706;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Nunito Sans', sans-serif;
      white-space: nowrap;
      &:hover { background: #B45309; }
    }
    .quota-progress {
      height: 4px;
      background: #FDE68A;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }
    .quota-progress-fill {
      height: 100%;
      background: #F59E0B;
      transition: width 0.3s;
      &.critical { background: #DC2626; }
    }
  `]
})
export class QuotaGuard implements OnInit {
  @Input() resource!: 'members' | 'branches' | 'users' | 'forms' | 'events' | 'ministries';
  @Output() upgradeClicked = new EventEmitter<void>();

  quotaCheck: QuotaCheck | null = null;

  constructor(private subscriptionService: SubscriptionService) {}

  ngOnInit(): void {
    this.subscriptionService.checkQuota(this.resource).subscribe({
      next: (check) => { this.quotaCheck = check; },
      error: (err) => console.error('Quota check failed:', err),
    });
  }

  getTitle(): string {
    const titles: Record<string, string> = {
      members: `Member limit reached (${this.quotaCheck?.limit} members)`,
      branches: `Branch limit reached (${this.quotaCheck?.limit} branches)`,
      users: `User limit reached (${this.quotaCheck?.limit} users)`,
      forms: `Form limit reached (${this.quotaCheck?.limit} forms)`,
      events: `Event limit reached (${this.quotaCheck?.limit} events)`,
      ministries: `Department limit reached (${this.quotaCheck?.limit} departments)`,
    };
    return titles[this.resource] || 'Limit reached';
  }

  getPercent(): number {
    if (!this.quotaCheck || !this.quotaCheck.limit) return 0;
    return Math.min(100, Math.round(
      (this.quotaCheck.current / this.quotaCheck.limit) * 100
    ));
  }

  onUpgrade(): void {
    this.upgradeClicked.emit();
  }
}
