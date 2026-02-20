// src/app/features/user-roles/components/manage-permissions/manage-permissions.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserPermission, Permission } from '../../../../models/user-role.model';
import { UserRolesService } from '../../services/user-roles';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-manage-permissions',
  standalone: false,
  templateUrl: './manage-permissions.html',
  styleUrl: './manage-permissions.scss',
})
export class ManagePermissions implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  userId: string = '';
  user: any = null;
  userPermissions: UserPermission[] = [];
  availablePermissions: Permission[] = [];
  permissionsByCategory: Record<string, Permission[]> = {};

  loading = false;
  loadingUser = true;
  processingPermission = false;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canManagePermissions = false;

  // Track processing state per permission
  processingPermissions: Set<string> = new Set();

  constructor(
    private userRolesService: UserRolesService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.userId = this.route.snapshot.paramMap.get('id') || '';

    if (!this.userId) {
      this.router.navigate(['main/user-roles']);
      return;
    }

    this.loadUser();
    this.loadUserPermissions();
    this.loadAvailablePermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManagePermissions = this.userRolesService.canManagePermissions();

    if (!this.canManagePermissions) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadUser(): void {
    this.loadingUser = true;
    this.errorMessage = '';

    this.userRolesService
      .getUserById(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user) => {
          this.user = user;
          this.loadingUser = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load user details';
          this.loadingUser = false;
          console.error('Error loading user:', error);
        },
      });
  }

  private loadUserPermissions(): void {
    this.loading = true;

    this.userRolesService
      .getUserPermissions(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (permissions) => {
          this.userPermissions = permissions;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error.message || 'Failed to load user permissions';
          this.loading = false;
          console.error('Error loading permissions:', error);
        },
      });
  }

  private loadAvailablePermissions(): void {
    this.availablePermissions = this.userRolesService.getAvailablePermissions();
    this.permissionsByCategory =
      this.userRolesService.getPermissionsByCategory();
  }

  // Permission Management
  hasPermission(permissionName: string): boolean {
    return this.userPermissions.some(
      (p) => p.permission_name === permissionName,
    );
  }

  isProcessingPermission(permissionName: string): boolean {
    return this.processingPermissions.has(permissionName);
  }

  togglePermission(permissionName: string): void {
    if (this.isProcessingPermission(permissionName)) {
      return; // Already processing this permission
    }

    if (this.hasPermission(permissionName)) {
      this.revokePermission(permissionName);
    } else {
      this.grantPermission(permissionName);
    }
  }

  private grantPermission(permissionName: string): void {
    this.processingPermissions.add(permissionName);
    this.errorMessage = '';

    this.userRolesService
      .grantPermission(this.userId, permissionName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Permission granted successfully!';
          this.loadUserPermissions();
          this.processingPermissions.delete(permissionName);

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to grant permission';
          this.processingPermissions.delete(permissionName);
          console.error('Error granting permission:', error);
        },
      });
  }

  private revokePermission(permissionName: string): void {
    const permission = this.userPermissions.find(
      (p) => p.permission_name === permissionName,
    );
    if (!permission) return;

    if (!confirm('Are you sure you want to revoke this permission?')) {
      return;
    }

    this.processingPermissions.add(permissionName);
    this.errorMessage = '';

    this.userRolesService
      .revokePermission(permission.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Permission revoked successfully!';
          this.loadUserPermissions();
          this.processingPermissions.delete(permissionName);

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to revoke permission';
          this.processingPermissions.delete(permissionName);
          console.error('Error revoking permission:', error);
        },
      });
  }

  // Bulk Operations
  toggleCategoryPermissions(category: string): void {
    const categoryPermissions = this.permissionsByCategory[category];
    if (!categoryPermissions) return;

    const allGranted = categoryPermissions.every((p) =>
      this.hasPermission(p.name),
    );

    if (allGranted) {
      // Revoke all
      const permissionNames = categoryPermissions.map((p) => p.name);
      this.bulkRevokePermissions(permissionNames);
    } else {
      // Grant all
      const permissionNames = categoryPermissions
        .filter((p) => !this.hasPermission(p.name))
        .map((p) => p.name);
      this.bulkGrantPermissions(permissionNames);
    }
  }

  private bulkGrantPermissions(permissionNames: string[]): void {
    if (permissionNames.length === 0) return;

    const confirmMessage = `Grant ${permissionNames.length} permission${permissionNames.length > 1 ? 's' : ''}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.processingPermission = true;
    this.errorMessage = '';

    this.userRolesService
      .bulkGrantPermissions(this.userId, permissionNames)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${permissionNames.length} permission${permissionNames.length > 1 ? 's' : ''} granted successfully!`;
          this.loadUserPermissions();
          this.processingPermission = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to grant permissions';
          this.processingPermission = false;
          console.error('Error granting permissions:', error);
        },
      });
  }

  private bulkRevokePermissions(permissionNames: string[]): void {
    if (permissionNames.length === 0) return;

    const confirmMessage = `Are you sure you want to revoke ${permissionNames.length} permission${permissionNames.length > 1 ? 's' : ''}? This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.processingPermission = true;
    this.errorMessage = '';

    this.userRolesService
      .bulkRevokePermissions(this.userId, permissionNames)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${permissionNames.length} permission${permissionNames.length > 1 ? 's' : ''} revoked successfully!`;
          this.loadUserPermissions();
          this.processingPermission = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to revoke permissions';
          this.processingPermission = false;
          console.error('Error revoking permissions:', error);
        },
      });
  }

  // Apply Role Template
  applyTemplate(templateId: string): void {
    const confirmMessage =
      'This will replace all existing permissions with the template permissions. Continue?';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.processingPermission = true;
    this.errorMessage = '';

    this.userRolesService
      .applyRoleTemplate(this.userId, templateId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template applied successfully!';
          this.loadUserPermissions();
          this.processingPermission = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to apply role template';
          this.processingPermission = false;
          console.error('Error applying template:', error);
        },
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/user-roles']);
  }

  // Helper Methods
  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      members: 'ri-group-line',
      attendance: 'ri-calendar-check-line',
      finance: 'ri-money-dollar-circle-line',
      ministries: 'ri-service-line',
      events: 'ri-calendar-event-line',
      communications: 'ri-message-3-line',
      forms: 'ri-file-list-3-line',
      branches: 'ri-building-line',
      sermons: 'ri-volume-up-line',
      settings: 'ri-settings-3-line',
      users: 'ri-user-settings-line',
    };
    return icons[category] || 'ri-shield-line';
  }

  getCategoryLabel(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  isCategoryFullyGranted(category: string): boolean {
    const categoryPermissions = this.permissionsByCategory[category];
    if (!categoryPermissions || categoryPermissions.length === 0) return false;
    return categoryPermissions.every((p) => this.hasPermission(p.name));
  }

  getCategoryGrantedCount(category: string): number {
    const categoryPermissions = this.permissionsByCategory[category];
    if (!categoryPermissions) return 0;
    return categoryPermissions.filter((p) => this.hasPermission(p.name)).length;
  }

  getCategoryTotalCount(category: string): number {
    const categoryPermissions = this.permissionsByCategory[category];
    return categoryPermissions?.length || 0;
  }

  getCategoryProgress(category: string): number {
    const total = this.getCategoryTotalCount(category);
    if (total === 0) return 0;
    const granted = this.getCategoryGrantedCount(category);
    return Math.round((granted / total) * 100);
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  formatUserRole(role: string): string {
    return role.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  get hasPermissionCategories(): boolean {
    return Object.keys(this.permissionsByCategory).length > 0;
  }
}
