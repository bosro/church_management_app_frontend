
// src/app/features/branches/components/branches-list/branches-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Branch } from '../../../../../models/branch.model';
import { BranchesService } from '../../../services/branches';

@Component({
  selector: 'app-branches-list',
  standalone: false,
  templateUrl: './branches-list.html',
  styleUrl: './branches-list.scss',
})
export class BranchesList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branches: Branch[] = [];
  statistics: any = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalBranches = 0;
  totalPages = 0;

  constructor(
    private branchesService: BranchesService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches(): void {
    this.loading = true;

    this.branchesService.getBranches(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.branches = data;
          this.totalBranches = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading branches:', error);
          this.loading = false;
        }
      });
  }

  loadStatistics(): void {
    this.branchesService.getBranchStatistics()
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
  createBranch(): void {
    this.router.navigate(['/branches/create']);
  }

  viewBranch(branchId: string): void {
    this.router.navigate(['/branches', branchId]);
  }

  editBranch(branchId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/branches', branchId, 'edit']);
  }

  deleteBranch(branchId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this branch? This will not delete members.')) {
      this.branchesService.deleteBranch(branchId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Branch deleted successfully!';
            this.loadBranches();
            this.loadStatistics();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete branch';
          }
        });
    }
  }

  exportBranches(): void {
    this.branchesService.exportBranches()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `branches_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Branches exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export branches';
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBranches();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBranches();
    }
  }
}
