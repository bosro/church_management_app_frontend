

// src/app/features/dashboard/components/stats-card/stats-card.component.ts
import { Component, Input } from '@angular/core';

@Component({
 selector: 'app-stats-card',
  standalone: false,
  templateUrl: './stats-card.html',
  styleUrl: './stats-card.scss',
})
export class StatsCard {
  @Input() title: string = '';
  @Input() value: number = 0;
  @Input() icon: string = '';
  @Input() iconBg: string = '#E5E7EB';
  @Input() iconColor: string = '#6B7280';
  @Input() trend: number = 0;
  @Input() trendText: string = '';
  @Input() trendUp: string = 'true';

  get trendIcon(): string {
    return this.trendUp === 'true' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  }

  get trendClass(): string {
    return this.trendUp === 'true' ? 'trend-up' : 'trend-down';
  }
}
