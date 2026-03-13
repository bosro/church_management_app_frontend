import { Component, OnInit } from '@angular/core';
import { AdminService, UserWithChurch } from '../../services/admin.service';
import { Church } from '../../../../models/church.model';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-admin-users',
  templateUrl: './users.html',
  standalone: false,
  styleUrls: ['./users.scss'],
})
export class Users implements OnInit {
  users: UserWithChurch[] = [];
  filteredUsers: UserWithChurch[] = [];
  churches: Church[] = []; // ✅ NEW
  loading = false;
  searchTerm = '';
  selectedRole = 'all';
  selectedStatus = 'all';

  // ✅ NEW: Edit modal state
  showEditModal = false;
  selectedUser: UserWithChurch | null = null;
  editForm = {
    role: '',
    church_id: '',
    is_active: true,
  };
  processing = false;

  errorMessage = '';
  successMessage = '';

  roleOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'church_admin', label: 'Church Admin' },
    { value: 'pastor', label: 'Pastor' },
    { value: 'finance_officer', label: 'Finance Officer' },
    { value: 'ministry_leader', label: 'Ministry Leader' },
    { value: 'group_leader', label: 'Group Leader' },
    { value: 'elder', label: 'Elder' },
    { value: 'member', label: 'Member' },
  ];

  statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadChurches(); // ✅ NEW
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getAllUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load users';
        this.loading = false;
      },
    });
  }

  // ✅ NEW: Load churches for dropdown
  loadChurches(): void {
    this.adminService.getAllChurches().subscribe({
      next: (data) => {
        this.churches = data.filter((c) => c.is_active);
      },
      error: (error) => {
        console.error('Failed to load churches:', error);
      },
    });
  }

  applyFilters(): void {
    this.filteredUsers = this.users.filter((user) => {
      const matchesSearch =
        !this.searchTerm ||
        user.full_name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesRole =
        this.selectedRole === 'all' || user.role === this.selectedRole;

      const matchesStatus =
        this.selectedStatus === 'all' ||
        (this.selectedStatus === 'active' && user.is_active) ||
        (this.selectedStatus === 'inactive' && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onRoleChange(): void {
    this.applyFilters();
  }

  onStatusChange(): void {
    this.applyFilters();
  }

  // ✅ NEW: Open edit modal
  openEditModal(user: UserWithChurch): void {
    this.selectedUser = user;
    this.editForm = {
      role: user.role,
      church_id: user.church_id || '',
      is_active: user.is_active,
    };
    this.showEditModal = true;
    this.errorMessage = '';
  }

  // ✅ NEW: Close edit modal
  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedUser = null;
  }

  // ✅ NEW: Update user
  updateUser(): void {
    if (!this.selectedUser) return;

    this.processing = true;
    this.errorMessage = '';

    // Update role
    this.adminService
      .updateUserRole(this.selectedUser.id, this.editForm.role)
      .subscribe({
        next: () => {
          // Update church assignment if changed
          if (this.editForm.church_id !== this.selectedUser!.church_id) {
            this.updateUserChurch();
          } else {
            this.finishUpdate();
          }
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update user role';
          this.processing = false;
        },
      });
  }

  // ✅ NEW: Update church assignment
  private updateUserChurch(): void {
    if (!this.selectedUser) return;

    this.adminService
      .updateUserChurch(this.selectedUser.id, this.editForm.church_id || null)
      .subscribe({
        next: () => {
          this.finishUpdate();
        },
        error: (error) => {
          this.errorMessage =
            error.message || 'Failed to update church assignment';
          this.processing = false;
        },
      });
  }

  // ✅ NEW: Finish update
  private finishUpdate(): void {
    this.successMessage = 'User updated successfully!';
    this.processing = false;
    this.closeEditModal();
    this.loadUsers();
    setTimeout(() => (this.successMessage = ''), 3000);
  }

  toggleUserStatus(user: UserWithChurch): void {
    const newStatus = !user.is_active;

    this.adminService.toggleUserStatus(user.id, newStatus).subscribe({
      next: () => {
        user.is_active = newStatus;
        this.successMessage = `User ${newStatus ? 'activated' : 'deactivated'} successfully`;
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to update user status';
        setTimeout(() => (this.errorMessage = ''), 3000);
      },
    });
  }

  getRoleBadgeClass(role: string): string {
    const roleMap: { [key: string]: string } = {
      super_admin: 'badge-super-admin',
      church_admin: 'badge-admin',
      pastor: 'badge-pastor',
      finance_officer: 'badge-finance',
      ministry_leader: 'badge-ministry',
      group_leader: 'badge-group',
      elder: 'badge-elder',
      member: 'badge-member',
    };
    return roleMap[role] || 'badge-default';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  get activeUsersCount(): number {
    return this.users.filter((u) => u.is_active).length;
  }

  get inactiveUsersCount(): number {
    return this.users.filter((u) => !u.is_active).length;
  }
}
