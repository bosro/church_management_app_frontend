import { Component, Input } from '@angular/core';
import { GivingTransaction } from '../../../../models/giving.model';

@Component({
  selector: 'app-giving-history',
  standalone: false,
  templateUrl: './giving-history.html',
  styleUrl: './giving-history.scss'
})
export class GivingHistory {
  @Input() transactions: GivingTransaction[] = [];
  @Input() loading = false;

  getPaymentMethodIcon(method: string): string {
    const iconMap: { [key: string]: string } = {
      'mobile_money': 'ri-smartphone-line',
      'cash': 'ri-money-dollar-circle-line',
      'bank_transfer': 'ri-bank-line',
      'card': 'ri-bank-card-line',
      'check': 'ri-file-list-line',
      'online': 'ri-global-line'
    };
    return iconMap[method.toLowerCase()] || 'ri-wallet-line';
  }

  getPaymentMethodLabel(method: string): string {
    const labelMap: { [key: string]: string } = {
      'mobile_money': 'Mobile Money',
      'cash': 'Cash',
      'bank_transfer': 'Bank Transfer',
      'card': 'Card',
      'check': 'Check',
      'online': 'Online'
    };
    return labelMap[method.toLowerCase()] || method;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCategoryIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();

    if (name.includes('tithe')) return 'ri-hand-heart-line';
    if (name.includes('offering')) return 'ri-gift-line';
    if (name.includes('seed')) return 'ri-seedling-line';
    if (name.includes('building')) return 'ri-building-line';
    if (name.includes('special')) return 'ri-star-line';

    return 'ri-money-dollar-circle-line';
  }

  getCategoryIconColor(categoryName: string): string {
    const name = categoryName.toLowerCase();

    if (name.includes('tithe')) return 'tithe';
    if (name.includes('offering')) return 'offering';
    if (name.includes('seed')) return 'seed';
    if (name.includes('building')) return 'building';
    if (name.includes('special')) return 'special';

    return 'default';
  }
}






