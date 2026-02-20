// src/app/features/user-roles/components/users-list/users-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserRolesService } from '../../services/user-roles';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-users-list',
  standalone: false,
  templateUrl: './users-list.html',
  styleUrl: './users-list.scss',
})
export class UsersList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  users: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalUsers = 0;
  totalPages = 0;

  // Permissions
  canManageRoles = false;
  canManagePermissions = false;

  constructor(
    private userRolesService: UserRolesService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageRoles = this.userRolesService.canManageRoles();
    this.canManagePermissions = this.userRolesService.canManagePermissions();

    if (!this.canManageRoles && !this.canManagePermissions) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';

    this.userRolesService.getUsers(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count, totalPages }) => {
          this.users = data;
          this.totalUsers = count;
          this.totalPages = totalPages;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load users. Please try again.';
          this.loading = false;
          console.error('Error loading users:', error);
        }
      });
  }

  // Navigation
  managePermissions(userId: string): void {
    if (!this.canManagePermissions) {
      this.errorMessage = 'You do not have permission to manage user permissions';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    this.router.navigate(['main/user-roles', userId, 'permissions']);
  }

  viewRoleTemplates(): void {
    if (!this.canManageRoles) {
      this.errorMessage = 'You do not have permission to manage role templates';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    this.router.navigate(['main/user-roles/templates']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadUsers();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadUsers();
      this.scrollToTop();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadUsers();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Helper Methods
  getRoleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      super_admin: 'role-super-admin',
      church_admin: 'role-admin',
      pastor: 'role-pastor',
      finance_officer: 'role-finance',
      group_leader: 'role-leader',
      member: 'role-member'
    };
    return classes[role] || 'role-member';
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      church_admin: 'Church Admin',
      pastor: 'Pastor',
      finance_officer: 'Finance Officer',
      group_leader: 'Group Leader',
      member: 'Member'
    };
    return labels[role] || role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
