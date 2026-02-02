
// src/app/features/sermons/components/sermons-list/sermons-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Sermon, SermonSeries, SermonsService } from '../../services/sermons';

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
  statistics: any = null;
  selectedSeries: string = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalSermons = 0;
  totalPages = 0;

  constructor(
    private sermonsService: SermonsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
    this.loadSermonSeries();
    this.loadSermons();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStatistics(): void {
    this.sermonsService.getSermonStatistics()
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

  loadSermonSeries(): void {
    this.sermonsService.getSermonSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => {
          this.sermonSeries = series;
        },
        error: (error) => {
          console.error('Error loading sermon series:', error);
        }
      });
  }

  loadSermons(): void {
    this.loading = true;

    this.sermonsService.getSermons(this.currentPage, this.pageSize, this.selectedSeries || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.sermons = data;
          this.totalSermons = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading sermons:', error);
          this.loading = false;
        }
      });
  }

  // Navigation
  createSermon(): void {
    this.router.navigate(['/sermon/create']);
  }

  viewSermon(sermonId: string): void {
    this.router.navigate(['/sermon', sermonId]);
  }

  editSermon(sermonId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/sermon', sermonId, 'edit']);
  }

  manageSeries(): void {
    this.router.navigate(['/sermon/series']);
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

    this.sermonsService.toggleFeatured(sermon.id, !sermon.is_featured)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = sermon.is_featured ? 'Removed from featured' : 'Added to featured';
          this.loadSermons();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update sermon';
        }
      });
  }

  deleteSermon(sermonId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this sermon?')) {
      this.sermonsService.deleteSermon(sermonId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Sermon deleted successfully!';
            this.loadSermons();
            this.loadStatistics();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete sermon';
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSermons();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSermons();
    }
  }

  // Helper Methods
  formatDuration(minutes?: number): string {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }
}
