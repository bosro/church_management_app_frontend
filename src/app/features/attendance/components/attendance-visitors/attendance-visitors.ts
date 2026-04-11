
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { Visitor } from '../../../../models/attendance.model';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-attendance-visitors',
  standalone: false,
  templateUrl: './attendance-visitors.html',
  styleUrl: './attendance-visitors.scss',
})
export class AttendanceVisitors implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  visitors: Visitor[] = [];
  loading = false;
  errorMessage = '';

  currentPage = 1;
  pageSize = 20;
  totalVisitors = 0;
  totalPages = 0;

  constructor(
    private attendanceService: AttendanceService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.loadVisitors();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadVisitors(): void {
    this.loading = true;
    this.errorMessage = '';
    this.attendanceService
      .getVisitors(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.visitors = data;
          this.totalVisitors = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load visitors';
          this.loading = false;
        },
      });
  }

  goBack(): void {
    this.router.navigate(['main/attendance']);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadVisitors();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadVisitors();
    }
  }

  getVisitorInitials(visitor: Visitor): string {
    return `${visitor.first_name[0]}${visitor.last_name[0]}`.toUpperCase();
  }

  getFullName(visitor: Visitor): string {
    return `${visitor.first_name} ${visitor.last_name}`;
  }
}




