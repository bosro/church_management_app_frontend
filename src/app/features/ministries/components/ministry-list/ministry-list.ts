// src/app/features/ministries/components/ministries-list/ministries-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { Ministry, MinistryStatistics } from '../../../../models/ministry.model';

@Component({
  selector: 'app-ministry-list',
  standalone: false,
  templateUrl: './ministry-list.html',
  styleUrl: './ministry-list.scss',
})
export class MinistryList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministries: Ministry[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalMinistries = 0;
  totalPages = 0;

  // Statistics
  statistics: MinistryStatistics | null = null;

  // Permissions
  canManageMinistries = false;
  canViewMinistries = false;

  constructor(
    private ministryService: MinistryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadMinistries();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageMinistries = this.ministryService.canManageMinistries();
    this.canViewMinistries = this.ministryService.canViewMinistries();

    if (!this.canViewMinistries) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadMinistries(): void {
    this.loading = true;
    this.errorMessage = '';

    this.ministryService
      .getMinistries(this.currentPage, this.pageSize, { isActive: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.ministries = data;
          this.totalMinistries = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load ministries';
          this.loading = false;
          console.error('Error loading ministries:', error);
        }
      });
  }

  loadStatistics(): void {
    this.ministryService
      .getMinistryStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
          // Don't show error to user for statistics failure
        }
      });
  }

  // Navigation
  viewMinistry(ministryId: string): void {
    this.router.navigate(['main/ministries', ministryId]);
  }

  createMinistry(): void {
    if (!this.canManageMinistries) {
      this.errorMessage = 'You do not have permission to create ministries';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/ministries/create']);
  }

  editMinistry(ministryId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageMinistries) {
      this.errorMessage = 'You do not have permission to edit ministries';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/ministries', ministryId, 'edit']);
  }

  deleteMinistry(ministryId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageMinistries) {
      this.errorMessage = 'You do not have permission to delete ministries';
      this.scrollToTop();
      return;
    }

    const ministry = this.ministries.find(m => m.id === ministryId);
    if (!ministry) return;

    let confirmMessage = `Are you sure you want to delete "${ministry.name}"?`;

    if (ministry.member_count && ministry.member_count > 0) {
      confirmMessage = `"${ministry.name}" has ${ministry.member_count} members. ` +
        `Please remove all members before deleting the ministry.`;
      alert(confirmMessage);
      return;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    this.ministryService
      .deleteMinistry(ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Ministry deleted successfully!';
          this.loadMinistries();
          this.loadStatistics();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete ministry';
          this.scrollToTop();
          console.error('Error deleting ministry:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMinistries();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadMinistries();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
