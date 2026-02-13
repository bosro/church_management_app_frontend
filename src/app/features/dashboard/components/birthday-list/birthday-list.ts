// src/app/features/dashboard/components/birthday-list/birthday-list.component.ts
import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';

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
export class BirthdayList implements OnChanges {
  @Input() birthdays: Birthday[] = [];
  @Output() viewAll = new EventEmitter<void>();
  @Output() viewMember = new EventEmitter<string>();

  selectedMonth = new Date().getMonth();
  months = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' }
  ];

  filteredBirthdays: Birthday[] = [];

  ngOnChanges(): void {
    this.filterBirthdaysByMonth();
  }

  onMonthChange(event: any): void {
    this.selectedMonth = parseInt(event.target.value);
    this.filterBirthdaysByMonth();
  }

  private filterBirthdaysByMonth(): void {
    if (this.selectedMonth === new Date().getMonth()) {
      // Show all for current month
      this.filteredBirthdays = this.birthdays;
    } else {
      // Filter by selected month
      this.filteredBirthdays = this.birthdays.filter(b => {
        const birthDate = new Date(b.date);
        return birthDate.getMonth() === this.selectedMonth;
      });
    }
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
      default:
        return 'badge-upcoming';
    }
  }

  formatPhone(phone: string): string {
    if (!phone) return '';
    // Format: 0555440404 -> 0555 440 404
    if (phone.length === 10) {
      return `${phone.substring(0, 4)} ${phone.substring(4, 7)} ${phone.substring(7)}`;
    }
    return phone;
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }
}
