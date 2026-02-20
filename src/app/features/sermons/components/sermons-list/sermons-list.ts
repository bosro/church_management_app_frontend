// src/app/features/sermons/components/sermons-list/sermons-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { SermonsService } from '../../services/sermons';
import { Sermon, SermonSeries, SermonStatistics } from '../../../../models/sermon.model';

@Component({
  selector: 'app-sermons-list',
  standalone: false,
  templateUrl: './sermons-list.html',
  styleUrl: './sermons-list.scss',
})
export class SermonsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sermons: Sermon[] = [];
  sermonSeries: SermonSeries[] = [];
  statistics: SermonStatistics | null = null;
  selectedSeries: string = '';
  loading = false;
  loadingStats = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalSermons = 0;
  totalPages = 0;

  // Permissions
  canManageSermons = false;
  canManageSeries = false;

  constructor(
    private sermonsService: SermonsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadStatistics();
    this.loadSermonSeries();
    this.loadSermons();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageSermons = this.sermonsService.canManageSermons();
    this.canManageSeries = this.sermonsService.canManageSeries();
  }

  loadStatistics(): void {
    this.loadingStats = true;

    this.sermonsService
      .getSermonStatistics()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loadingStats = false)
      )
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

  loadSermonSeries(): void {
    this.sermonsService
      .getSermonSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => {
          this.sermonSeries = series;
        },
        error: (error) => {
          console.error('Error loading sermon series:', error);
          // Don't show error to user for series failure
        }
      });
  }

  loadSermons(): void {
    this.loading = true;
    this.errorMessage = '';

    this.sermonsService
      .getSermons(this.currentPage, this.pageSize, this.selectedSeries || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: ({ data, count }) => {
          this.sermons = data;
          this.totalSermons = count;
          this.totalPages = Math.ceil(count / this.pageSize);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load sermons';
          this.scrollToTop();
          console.error('Error loading sermons:', error);
        }
      });
  }

  // Navigation
  createSermon(): void {
    if (!this.canManageSermons) {
      this.errorMessage = 'You do not have permission to upload sermons';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/sermon/create']);
  }

  viewSermon(sermonId: string): void {
    this.router.navigate(['main/sermon', sermonId]);
  }

  editSermon(sermonId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageSermons) {
      this.errorMessage = 'You do not have permission to edit sermons';
      this.scrollToTop();
      return;
    }

    this.router.navigate(['main/sermon', sermonId, 'edit']);
  }

  manageSeries(): void {
    if (!this.canManageSeries) {
      this.errorMessage = 'You do not have permission to manage sermon series';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/sermon/series']);
  }

  // Filters
  filterBySeries(seriesName: string): void {
    this.selectedSeries = seriesName;
    this.currentPage = 1;
    this.loadSermons();
  }

  clearFilter(): void {
    this.selectedSeries = '';
    this.currentPage = 1;
    this.loadSermons();
  }

  // Actions
  toggleFeatured(sermon: Sermon, event: Event): void {
    event.stopPropagation();

    if (!this.canManageSermons) {
      this.errorMessage = 'You do not have permission to feature sermons';
      this.scrollToTop();
      return;
    }

    const newStatus = !sermon.is_featured;
    const action = newStatus ? 'featuring' : 'unfeaturing';

    this.sermonsService
      .toggleFeatured(sermon.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = newStatus
            ? `"${sermon.title}" added to featured sermons`
            : `"${sermon.title}" removed from featured sermons`;

          this.loadSermons();
          this.loadStatistics(); // Update featured count

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || `Failed to update sermon`;
          this.scrollToTop();
          console.error('Error toggling featured:', error);
        }
      });
  }

  deleteSermon(sermonId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageSermons) {
      this.errorMessage = 'You do not have permission to delete sermons';
      this.scrollToTop();
      return;
    }

    const sermon = this.sermons.find(s => s.id === sermonId);
    if (!sermon) return;

    const confirmMessage = `Are you sure you want to delete "${sermon.title}"?\n\nThis action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.sermonsService
      .deleteSermon(sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `"${sermon.title}" deleted successfully!`;
          this.loadSermons();
          this.loadStatistics();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete sermon';
          this.scrollToTop();
          console.error('Error deleting sermon:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSermons();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSermons();
      this.scrollToTop();
    }
  }

  // Helper Methods
  formatDuration(minutes?: number): string {
    return this.sermonsService.formatDuration(minutes);
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
