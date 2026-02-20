// src/app/features/communications/components/email-logs/email-logs.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../../services/communications';
import { EmailLog } from '../../../../../models/communication.model';

@Component({
  selector: 'app-email-logs',
  standalone: false,
  templateUrl: './email-logs.html',
  styleUrl: './email-logs.scss',
})
export class EmailLogs implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  emailLogs: EmailLog[] = [];
  loading = false;
  errorMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalLogs = 0;
  totalPages = 0;

  // Permissions
  canViewCommunications = false;

  constructor(
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEmailLogs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canViewCommunications = this.communicationsService.canViewCommunications();

    if (!this.canViewCommunications) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadEmailLogs(): void {
    this.loading = true;
    this.errorMessage = '';

    this.communicationsService
      .getEmailLogs(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.emailLogs = data;
          this.totalLogs = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load email logs';
          this.loading = false;
          console.error('Error loading email logs:', error);
        }
      });
  }

  goBack(): void {
    this.router.navigate(['main/communications']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadEmailLogs();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadEmailLogs();
      this.scrollToTop();
    }
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      sent: 'status-sent',
      delivered: 'status-delivered',
      opened: 'status-opened',
      failed: 'status-failed',
      pending: 'status-pending'
    };
    return classes[status] || 'status-pending';
  }

  getMemberName(log: EmailLog): string {
    if (log.member) {
      return `${log.member.first_name} ${log.member.last_name}`;
    }
    return 'N/A';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
