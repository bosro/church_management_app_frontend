
// src/app/features/ministries/components/ministries-list/ministries-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { Ministry } from '../../../../models/ministry.model';

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

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalMinistries = 0;
  totalPages = 0;

  // Statistics
  statistics: any = null;

  constructor(
    private ministryService: MinistryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadMinistries();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMinistries(): void {
    this.loading = true;

    this.ministryService.getMinistries(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.ministries = data;
          this.totalMinistries = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading ministries:', error);
          this.loading = false;
        }
      });
  }

  loadStatistics(): void {
    this.ministryService.getMinistryStatistics()
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
  viewMinistry(ministryId: string): void {
    this.router.navigate(['main/ministries', ministryId]);
  }

  createMinistry(): void {
    this.router.navigate(['main/ministries/create']);
  }

  editMinistry(ministryId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/ministries', ministryId, 'edit']);
  }

  deleteMinistry(ministryId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this ministry?')) {
      this.ministryService.deleteMinistry(ministryId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadMinistries();
            this.loadStatistics();
          },
          error: (error) => {
            console.error('Error deleting ministry:', error);
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMinistries();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadMinistries();
    }
  }
}
