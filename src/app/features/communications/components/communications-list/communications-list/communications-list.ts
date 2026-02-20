// src/app/features/communications/components/communications-list/communications-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../../services/communications';
import { Communication, CommunicationStatistics } from '../../../../../models/communication.model';

@Component({
  selector: 'app-communications-list',
  standalone: false,
  templateUrl: './communications-list.html',
  styleUrl: './communications-list.scss',
})
export class CommunicationsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  communications: Communication[] = [];
  statistics: CommunicationStatistics | null = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalCommunications = 0;
  totalPages = 0;

  // Permissions
  canManageCommunications = false;
  canSendCommunications = false;

  constructor(
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadCommunications();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageCommunications = this.communicationsService.canManageCommunications();
    this.canSendCommunications = this.communicationsService.canSendCommunications();

    if (!this.communicationsService.canViewCommunications()) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadCommunications(): void {
    this.loading = true;
    this.errorMessage = '';

    this.communicationsService
      .getCommunications(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.communications = data;
          this.totalCommunications = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load communications';
          this.loading = false;
          console.error('Error loading communications:', error);
        }
      });
  }

  loadStatistics(): void {
    this.communicationsService
      .getCommunicationStatistics()
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
    if (!this.canManageCommunications) {
      this.errorMessage = 'You do not have permission to create communications';
      return;
    }
    this.router.navigate(['main/communications/create']);
  }

  viewSmsLogs(): void {
    this.router.navigate(['main/communications/sms-logs']);
  }

  viewEmailLogs(): void {
    this.router.navigate(['main/communications/email-logs']);
  }

  sendCommunication(communicationId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canSendCommunications) {
      this.errorMessage = 'You do not have permission to send communications';
      return;
    }

    const communication = this.communications.find(c => c.id === communicationId);
    if (!communication) return;

    const confirmMessage = `Are you sure you want to send "${communication.title}"? This will send ${communication.communication_type === 'both' ? 'SMS and Email' : communication.communication_type.toUpperCase()} to ${communication.target_audience} members.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.communicationsService
      .sendCommunication(communicationId)
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
          console.error('Send error:', error);
        }
      });
  }

  deleteCommunication(communicationId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageCommunications) {
      this.errorMessage = 'You do not have permission to delete communications';
      return;
    }

    const communication = this.communications.find(c => c.id === communicationId);
    if (!communication) return;

    if (communication.status === 'sent') {
      this.errorMessage = 'Cannot delete a sent communication';
      return;
    }

    if (!confirm('Are you sure you want to delete this communication?')) {
      return;
    }

    this.communicationsService
      .deleteCommunication(communicationId)
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
          console.error('Delete error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadCommunications();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadCommunications();
      this.scrollToTop();
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

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
