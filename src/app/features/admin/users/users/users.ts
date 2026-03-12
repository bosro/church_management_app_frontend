import { Component, OnInit } from '@angular/core';
import { AdminService, UserWithChurch } from '../../services/admin.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-users',
  standalone: false,
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users implements OnInit {
  users: UserWithChurch[] = [];
  filteredUsers: UserWithChurch[] = [];
  loading = false;
  searchTerm = '';
  selectedRole = 'all';
  selectedStatus = 'all';

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
