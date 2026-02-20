// src/app/features/branches/components/branches-list/branches-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BranchesService } from '../../../services/branches';
import { Branch, BranchStatistics } from '../../../../../models/branch.model';

@Component({
  selector: 'app-branches-list',
  standalone: false,
  templateUrl: './branches-list.html',
  styleUrl: './branches-list.scss',
})
export class BranchesList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branches: Branch[] = [];
  statistics: BranchStatistics | null = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalBranches = 0;
  totalPages = 0;

  // Permissions
  canManageBranches = false;
  canViewBranches = false;

  constructor(
    private branchesService: BranchesService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadBranches();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageBranches = this.branchesService.canManageBranches();
    this.canViewBranches = this.branchesService.canViewBranches();

    if (!this.canViewBranches) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadBranches(): void {
    this.loading = true;
    this.errorMessage = '';

    this.branchesService
      .getBranches(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.branches = data;
          this.totalBranches = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load branches';
          this.loading = false;
          console.error('Error loading branches:', error);
        }
      });
  }

  loadStatistics(): void {
    this.branchesService
      .getBranchStatistics()
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
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to create branches';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/branches/create']);
  }

  viewBranch(branchId: string): void {
    this.router.navigate(['main/branches', branchId]);
  }

  editBranch(branchId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to edit branches';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/branches', branchId, 'edit']);
  }

  deleteBranch(branchId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to delete branches';
      this.scrollToTop();
      return;
    }

    const branch = this.branches.find(b => b.id === branchId);
    if (!branch) return;

    const confirmMessage = branch.member_count > 0
      ? `This branch has ${branch.member_count} member${branch.member_count !== 1 ? 's' : ''}. Are you sure you want to delete it? This will not delete members.`
      : 'Are you sure you want to delete this branch?';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.branchesService
      .deleteBranch(branchId)
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
          this.scrollToTop();
          console.error('Delete error:', error);
        }
      });
  }

  exportBranches(): void {
    if (this.branches.length === 0) {
      this.errorMessage = 'No branches to export';
      this.scrollToTop();
      return;
    }

    this.branchesService
      .exportBranches()
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
          this.scrollToTop();
          console.error('Export error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBranches();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBranches();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
