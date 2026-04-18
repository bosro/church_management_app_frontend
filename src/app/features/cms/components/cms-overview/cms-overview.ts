// src/app/features/cms/components/cms-overview/cms-overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';
import { CmsStatistics } from '../../../../models/cms.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

const CMS_VIEW_ROLES = [
  'pastor', 'senior_pastor', 'associate_pastor', 'ministry_leader', 'secretary',
];
const CMS_MANAGE_ROLES = [
  'pastor', 'senior_pastor', 'associate_pastor', 'ministry_leader',
];

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
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService
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
  const role = this.authService.getCurrentUserRole();

  this.canViewContent =
    this.permissionService.isAdmin ||
    CMS_VIEW_ROLES.includes(role);

  this.canManageContent =
    this.permissionService.isAdmin ||
    CMS_MANAGE_ROLES.includes(role);

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
        },
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




