// src/app/features/user-roles/components/manage-permissions/manage-permissions.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserPermission, Permission } from '../../../../models/user-role.model';
import { UserRolesService } from '../../services/user-roles';

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
  errorMessage = '';
  successMessage = '';

  // Selected permissions for bulk operations
  selectedPermissions: Set<string> = new Set();

  constructor(
    private userRolesService: UserRolesService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') || '';
    if (this.userId) {
      this.loadUser();
      this.loadUserPermissions();
      this.loadAvailablePermissions();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadUser(): void {
    this.loadingUser = true;

    this.userRolesService.getUserById(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user) => {
          this.user = user;
          this.loadingUser = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load user';
          this.loadingUser = false;
        }
      });
  }

  private loadUserPermissions(): void {
    this.loading = true;

    this.userRolesService.getUserPermissions(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (permissions) => {
          this.userPermissions = permissions;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading permissions:', error);
          this.loading = false;
        }
      });
  }

  private loadAvailablePermissions(): void {
    this.availablePermissions = this.userRolesService.getAvailablePermissions();
    this.permissionsByCategory = this.userRolesService.getPermissionsByCategory();
  }

  // Permission Management
  hasPermission(permissionName: string): boolean {
    return this.userPermissions.some(p => p.permission_name === permissionName);
  }

  togglePermission(permissionName: string): void {
    if (this.hasPermission(permissionName)) {
      this.revokePermission(permissionName);
    } else {
      this.grantPermission(permissionName);
    }
  }

  private grantPermission(permissionName: string): void {
    this.userRolesService.grantPermission(this.userId, permissionName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Permission granted successfully!';
          this.loadUserPermissions();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to grant permission';
        }
      });
  }

  private revokePermission(permissionName: string): void {
    const permission = this.userPermissions.find(p => p.permission_name === permissionName);
    if (!permission) return;

    if (confirm('Are you sure you want to revoke this permission?')) {
      this.userRolesService.revokePermission(permission.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Permission revoked successfully!';
            this.loadUserPermissions();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to revoke permission';
          }
        });
    }
  }

  // Bulk Operations
  toggleCategoryPermissions(category: string): void {
    const categoryPermissions = this.permissionsByCategory[category];
    const allGranted = categoryPermissions.every(p => this.hasPermission(p.name));

    if (allGranted) {
      // Revoke all
      const permissionNames = categoryPermissions.map(p => p.name);
      this.bulkRevokePermissions(permissionNames);
    } else {
      // Grant all
      const permissionNames = categoryPermissions
        .filter(p => !this.hasPermission(p.name))
        .map(p => p.name);
      this.bulkGrantPermissions(permissionNames);
    }
  }

  private bulkGrantPermissions(permissionNames: string[]): void {
    this.userRolesService.bulkGrantPermissions(this.userId, permissionNames)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Permissions granted successfully!';
          this.loadUserPermissions();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to grant permissions';
        }
      });
  }

  private bulkRevokePermissions(permissionNames: string[]): void {
    if (confirm(`Are you sure you want to revoke ${permissionNames.length} permissions?`)) {
      this.userRolesService.bulkRevokePermissions(this.userId, permissionNames)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Permissions revoked successfully!';
            this.loadUserPermissions();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to revoke permissions';
          }
        });
    }
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/user-roles']);
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
      users: 'ri-user-settings-line'
    };
    return icons[category] || 'ri-shield-line';
  }

  getCategoryLabel(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  isCategoryFullyGranted(category: string): boolean {
    const categoryPermissions = this.permissionsByCategory[category];
    return categoryPermissions.every(p => this.hasPermission(p.name));
  }

  getCategoryGrantedCount(category: string): number {
    const categoryPermissions = this.permissionsByCategory[category];
    return categoryPermissions.filter(p => this.hasPermission(p.name)).length;
  }

  getCategoryTotalCount(category: string): number {
    return this.permissionsByCategory[category].length;
  }
}
