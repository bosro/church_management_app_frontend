import { Component } from '@angular/core';

@Component({
  selector: 'app-sms-logs',
  standalone: false,
  templateUrl: './sms-logs.html',
  styleUrl: './sms-logs.scss',
})
export class SmsLogs {

}
// src/app/features/communications/components/sms-logs/sms-logs.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../services/communications.service';

@Component({
  selector: 'app-sms-logs',
  templateUrl: './sms-logs.component.html',
  styleUrls: ['./sms-logs.component.scss']
})
export class SmsLogsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  smsLogs: any[] = [];
  loading = false;

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalLogs = 0;
  totalPages = 0;

  constructor(
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSmsLogs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSmsLogs(): void {
    this.loading = true;

    this.communicationsService.getSmsLogs(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.smsLogs = data;
          this.totalLogs = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading SMS logs:', error);
          this.loading = false;
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/communications']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSmsLogs();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSmsLogs();
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

  getMemberName(log: any): string {
    if (log.member) {
      return `${log.member.first_name} ${log.member.last_name}`;
    }
    return 'N/A';
  }
}
