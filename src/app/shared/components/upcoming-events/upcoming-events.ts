// src/app/shared/components/upcoming-events/upcoming-events.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: 'service' | 'meeting' | 'event' | 'other';
  attendees?: number;
}

@Component({
  selector: 'app-upcoming-events',
  standalone: false,
  templateUrl: './upcoming-events.html',
  styleUrl: './upcoming-events.scss',
})
export class UpcomingEvents {
  @Input() events: Event[] = [];
  @Input() canViewAll = true; // ✅ NEW: Permission to view all events
  @Output() viewAll = new EventEmitter<void>();
  @Output() viewEvent = new EventEmitter<string>();

  onViewAll(): void {
    this.viewAll.emit();
  }

  onViewEvent(id: string): void {
    this.viewEvent.emit(id);
  }

  getEventIcon(type: string): string {
    switch (type) {
      case 'service':
        return 'ri-church-line';
      case 'meeting':
        return 'ri-team-line';
      case 'event':
        return 'ri-calendar-event-line';
      default:
        return 'ri-calendar-line';
    }
  }

  getEventColor(type: string): string {
    switch (type) {
      case 'service':
        return '#7C3AED';
      case 'meeting':
        return '#3B82F6';
      case 'event':
        return '#10B981';
      default:
        return '#6B7280';
    }
  }
}
