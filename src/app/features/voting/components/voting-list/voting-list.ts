// src/app/features/voting/components/voting-list/voting-list.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { VotingService } from '../../services/voting.service';
import { VotingCategory } from '../../../../models/voting.model';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-voting-list',
  standalone: false,
  templateUrl: './voting-list.html',
  styleUrl: './voting-list.scss',
})
export class VotingList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  categories: VotingCategory[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  canManage = false;

  constructor(
    private votingService: VotingService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCategories(): void {
    this.loading = true;
    this.votingService
      .getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cats) => {
          this.categories = cats;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load voting categories';
          this.loading = false;
        },
      });
  }

  viewCategory(id: string): void {
    this.router.navigate(['/main/voting', id]);
  }

  createCategory(): void {
    this.router.navigate(['/main/voting/manage']);
  }

  editCategory(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.router.navigate(['/main/voting/manage', id]);
  }

  deleteCategory(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (
      !confirm(
        'Delete this voting category? All nominees and votes will be removed.',
      )
    )
      return;

    this.votingService
      .deleteCategory(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Category deleted successfully!';
          this.loadCategories();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete category';
        },
      });
  }

  getStatusLabel(status: VotingCategory['status']): string {
    const map: Record<string, string> = {
      upcoming: 'Upcoming',
      nominations_open: 'Nominations Open',
      voting_open: 'Voting Open',
      closed: 'Closed',
    };
    return map[status || 'upcoming'] || 'Unknown';
  }

  getStatusClass(status: VotingCategory['status']): string {
    const map: Record<string, string> = {
      upcoming: 'status-upcoming',
      nominations_open: 'status-nominations',
      voting_open: 'status-voting',
      closed: 'status-closed',
    };
    return map[status || 'upcoming'] || '';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  getActiveCount(): number {
    return this.categories.filter((c) => c.status === 'voting_open').length;
  }

  getUpcomingCount(): number {
    return this.categories.filter(
      (c) => c.status === 'upcoming' || c.status === 'nominations_open',
    ).length;
  }

  getClosedCount(): number {
    return this.categories.filter((c) => c.status === 'closed').length;
  }
}
