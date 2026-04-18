// src/app/features/user-roles/components/users-list/users-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter, take } from 'rxjs/operators';
import { UserRolesService } from '../../services/user-roles';
import { AuthService } from '../../../../core/services/auth';
import { PermissionService } from '../../../../core/services/permission.service';

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
  canDeleteUser = false;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalUsers = 0;
  totalPages = 0;

  // Permissions
  canManageRoles = false;
  canManagePermissions = false;

  currentUserId = '';

  // Delete Modal
  showDeleteModal = false;
  userToDelete: { id: string; name: string } | null = null;
  isDeleting = false;

  showRoleModal = false;
  userToChangeRole: { id: string; name: string; currentRole: string } | null =
    null;
  selectedNewRole = '';
  isChangingRole = false;
  availableRoles: { value: string; label: string }[] = [];

  constructor(
    private userRolesService: UserRolesService,
    private authService: AuthService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    // Wait for auth to be ready before loading users
    this.authService.authReady$
      .pipe(
        filter((ready) => ready),
        take(1),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.checkPermissions();
        this.availableRoles = this.userRolesService.getAssignableRoles();
        this.currentUserId = this.authService.getUserId();
        this.loadUsers();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageRoles = this.userRolesService.canManageRoles();
    this.canManagePermissions = this.userRolesService.canManagePermissions();
    // Only church_admin (not pastor) can delete users
    this.canDeleteUser =
      this.authService.getCurrentUserRole() === 'church_admin' ||
      this.authService.getCurrentUserRole() === 'super_admin';

    if (!this.canManageRoles && !this.canManagePermissions) {
      this.router.navigate(['/unauthorized']);
    }
  }

  openRoleModal(
    userId: string,
    userName: string,
    currentRole: string,
    event: Event,
  ): void {
    event.stopPropagation();
    if (!this.canManageRoles) {
      this.errorMessage = 'You do not have permission to change roles';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    if (userId === this.authService.getUserId()) {
      this.errorMessage = 'You cannot change your own role';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    this.userToChangeRole = { id: userId, name: userName, currentRole };
    this.selectedNewRole = currentRole;
    this.showRoleModal = true;
  }

  closeRoleModal(): void {
    if (this.isChangingRole) return;
    this.showRoleModal = false;
    this.userToChangeRole = null;
    this.selectedNewRole = '';
  }

  confirmRoleChange(): void {
    if (!this.userToChangeRole || this.isChangingRole) return;
    if (this.selectedNewRole === this.userToChangeRole.currentRole) {
      this.closeRoleModal();
      return;
    }

    this.isChangingRole = true;

    this.userRolesService
      .updateUserRole(this.userToChangeRole.id, this.selectedNewRole)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `Role updated to ${this.getRoleLabel(this.selectedNewRole)} successfully!`;
          this.loadUsers();
          setTimeout(() => (this.successMessage = ''), 3000);
          this.isChangingRole = false;
          this.closeRoleModal();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to update role';
          this.isChangingRole = false;
          this.closeRoleModal();
        },
      });
  }

  openDeleteModal(userId: string, userName: string, event: Event): void {
    event.stopPropagation();

    if (!this.canDeleteUser) {
      this.errorMessage = 'You do not have permission to delete users';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    // Prevent self-deletion
    if (userId === this.authService.getUserId()) {
      this.errorMessage = 'You cannot delete your own account';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    this.userToDelete = { id: userId, name: userName };
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    if (this.isDeleting) return; // Prevent closing while deleting
    this.showDeleteModal = false;
    this.userToDelete = null;
  }

  confirmDelete(): void {
    if (!this.userToDelete || this.isDeleting) return;

    this.isDeleting = true;

    this.userRolesService
      .deleteUser(this.userToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${this.userToDelete!.name} has been deleted successfully.`;
          this.loadUsers();
          setTimeout(() => (this.successMessage = ''), 3000);
          this.isDeleting = false;
          this.closeDeleteModal();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete user';
          console.error('Delete user error:', err);
          this.isDeleting = false;
          this.closeDeleteModal();
        },
      });
  }

  deleteUser(userId: string, userName: string): void {
    // This method is kept for backward compatibility but now just opens the modal
    this.openDeleteModal(userId, userName, new Event('click'));
  }

  loadUsers(): void {
    // Validate church_id before making the call
    const churchId = this.authService.getChurchId();
    if (!churchId) {
      this.errorMessage =
        'Church information not available. Please log out and log in again.';
      this.loading = false;
      console.error('Church ID is undefined');
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.userRolesService
      .getUsers(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count, totalPages }) => {
          this.users = data;
          this.totalUsers = count;
          this.totalPages = totalPages;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage =
            error.message || 'Failed to load users. Please try again.';
          this.loading = false;
          console.error('Error loading users:', error);
        },
      });
  }

  // Navigation
  managePermissions(userId: string): void {
    if (!this.canManagePermissions) {
      this.errorMessage =
        'You do not have permission to manage user permissions';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    this.router.navigate([
      'main/user-roles/manage-permission',
      userId,
      'permissions',
    ]);
  }

  viewRoleTemplates(): void {
    if (!this.canManageRoles) {
      this.errorMessage = 'You do not have permission to manage role templates';
      setTimeout(() => (this.errorMessage = ''), 3000);
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

  createUser(): void {
    this.router.navigate(['main/user-roles/create']);
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
      senior_pastor: 'role-pastor',
      associate_pastor: 'role-pastor',
      finance_officer: 'role-finance',
      ministry_leader: 'role-ministry',
      group_leader: 'role-leader',
      cell_leader: 'role-cell',
      elder: 'role-elder',
      deacon: 'role-elder',
      worship_leader: 'role-worship',
      member: 'role-member',
    };
    return classes[role] || 'role-member';
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      church_admin: 'Church Admin',
      pastor: 'Pastor',
      senior_pastor: 'Senior Pastor',
      associate_pastor: 'Associate Pastor',
      finance_officer: 'Finance Officer',
      ministry_leader: 'Ministry Leader',
      group_leader: 'Group Leader',
      cell_leader: 'Cell Leader',
      elder: 'Elder',
      deacon: 'Deacon',
      worship_leader: 'Worship Leader',
      member: 'Member',
    };
    return (
      labels[role] ||
      role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}





