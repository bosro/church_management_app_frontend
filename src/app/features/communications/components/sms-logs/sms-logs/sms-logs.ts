// src/app/features/communications/components/sms-logs/sms-logs.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../../services/communications';
import { SmsLog } from '../../../../../models/communication.model';

@Component({
  selector: 'app-sms-logs',
  standalone: false,
  templateUrl: './sms-logs.html',
  styleUrl: './sms-logs.scss',
})
export class SmsLogs implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  smsLogs: SmsLog[] = [];
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
    this.loadSmsLogs();
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

  loadSmsLogs(): void {
    this.loading = true;
    this.errorMessage = '';

    this.communicationsService
      .getSmsLogs(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.smsLogs = data;
          this.totalLogs = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load SMS logs';
          this.loading = false;
          console.error('Error loading SMS logs:', error);
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
      this.loadSmsLogs();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSmsLogs();
      this.scrollToTop();
    }
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      sent: 'status-sent',
      delivered: 'status-delivered',
      failed: 'status-failed',
      pending: 'status-pending'
    };
    return classes[status] || 'status-pending';
  }

  getMemberName(log: SmsLog): string {
    if (log.member) {
      return `${log.member.first_name} ${log.member.last_name}`;
    }
    return 'N/A';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
