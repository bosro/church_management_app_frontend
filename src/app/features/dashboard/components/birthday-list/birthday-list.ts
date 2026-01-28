

// src/app/features/dashboard/components/birthday-list/birthday-list.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';

interface Birthday {
  id: string;
  name: string;
  location: string;
  date: string;
  age: number;
  phone: string;
  status: 'Today' | 'Tomorrow' | 'Passed';
  avatar?: string;
}

@Component({
  selector: 'app-birthday-list',
  standalone: false,
  templateUrl: './birthday-list.html',
  styleUrl: './birthday-list.scss',
})
export class BirthdayList {
  @Input() birthdays: Birthday[] = [];
  @Output() viewAll = new EventEmitter<void>();
  @Output() viewMember = new EventEmitter<string>();

  selectedMonth = 'January';
  months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  onMonthChange(event: any): void {
    this.selectedMonth = event.target.value;
    // Filter birthdays by month
  }

  onViewAll(): void {
    this.viewAll.emit();
  }

  onViewMember(memberId: string): void {
    this.viewMember.emit(memberId);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Today':
        return 'badge-today';
      case 'Tomorrow':
        return 'badge-tomorrow';
      case 'Passed':
        return 'badge-passed';
      default:
        return '';
    }
  }

  formatPhone(phone: string): string {
    // Format: 0555440404 -> 0555 440 404
    if (phone.length === 10) {
      return `${phone.substring(0, 4)} ${phone.substring(4, 7)} ${phone.substring(7)}`;
    }
    return phone;
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }
}
