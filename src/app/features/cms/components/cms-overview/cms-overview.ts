// src/app/features/cms/components/cms-overview/cms-overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';
import { CmsStatistics } from '../../../../models/cms.model';

@Component({
  selector: 'app-cms-overview',
  standalone: false,
  templateUrl: './cms-overview.html',
  styleUrl: './cms-overview.scss',
})
export class CmsOverview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  statistics: CmsStatistics | null = null;
  loading = true;
  errorMessage = '';

  // Permissions
  canManageContent = false;
  canViewContent = false;

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageContent = this.cmsService.canManageContent();
    this.canViewContent = this.cmsService.canViewContent();

    if (!this.canViewContent) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadStatistics(): void {
    this.loading = true;
    this.errorMessage = '';

    this.cmsService
      .getCmsStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
          console.error('Error loading statistics:', error);
        }
      });
  }

  // Navigation
  navigateToPages(): void {
    this.router.navigate(['main/cms/pages']);
  }

  navigateToBlog(): void {
    this.router.navigate(['main/cms/blog']);
  }

  createPage(): void {
    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to create pages';
      return;
    }
    this.router.navigate(['main/cms/pages/create']);
  }

  createBlogPost(): void {
    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to create blog posts';
      return;
    }
    this.router.navigate(['main/cms/blog/create']);
  }
}
