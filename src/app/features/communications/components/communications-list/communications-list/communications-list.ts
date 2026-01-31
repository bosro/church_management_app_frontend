import { Component } from '@angular/core';

@Component({
  selector: 'app-communications-list',
  standalone: false,
  templateUrl: './communications-list.html',
  styleUrl: './communications-list.scss',
})
export class CommunicationsList {

}
// src/app/features/communications/components/communications-list/communications-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService, Communication } from '../../services/communications.service';

@Component({
  selector: 'app-communications-list',
  templateUrl: './communications-list.component.html',
  styleUrls: ['./communications-list.component.scss']
})
export class CommunicationsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  communications: Communication[] = [];
  statistics: any = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalCommunications = 0;
  totalPages = 0;

  constructor(
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCommunications();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCommunications(): void {
    this.loading = true;

    this.communicationsService.getCommunications(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.communications = data;
          this.totalCommunications = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading communications:', error);
          this.loading = false;
        }
      });
  }

  loadStatistics(): void {
    this.communicationsService.getCommunicationStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        }
      });
  }

  // Navigation
  createCommunication(): void {
    this.router.navigate(['/communications/create']);
  }

  viewSmsLogs(): void {
    this.router.navigate(['/communications/sms-logs']);
  }

  viewEmailLogs(): void {
    this.router.navigate(['/communications/email-logs']);
  }

  sendCommunication(communicationId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to send this communication?')) {
      this.communicationsService.sendCommunication(communicationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Communication sent successfully!';
            this.loadCommunications();
            this.loadStatistics();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to send communication';
          }
        });
    }
  }

  deleteCommunication(communicationId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this communication?')) {
      this.communicationsService.deleteCommunication(communicationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Communication deleted successfully!';
            this.loadCommunications();
            this.loadStatistics();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete communication';
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadCommunications();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadCommunications();
    }
  }

  // Helper methods
  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      draft: 'status-draft',
      scheduled: 'status-scheduled',
      sending: 'status-sending',
      sent: 'status-sent',
      failed: 'status-failed'
    };
    return classes[status] || 'status-draft';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Draft',
      scheduled: 'Scheduled',
      sending: 'Sending',
      sent: 'Sent',
      failed: 'Failed'
    };
    return labels[status] || status;
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      sms: 'ri-message-3-line',
      email: 'ri-mail-line',
      both: 'ri-notification-line'
    };
    return icons[type] || 'ri-message-line';
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      sms: 'SMS',
      email: 'Email',
      both: 'SMS & Email'
    };
    return labels[type] || type;
  }
}
