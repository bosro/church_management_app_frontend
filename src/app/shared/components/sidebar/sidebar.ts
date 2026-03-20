// src/app/shared/components/sidebar/sidebar.component.ts
import { Component, OnInit, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { User } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth';
import { SidebarService } from '../../../core/services/sidebar.service';
import { UserRolesService } from '../../../features/user-roles/services/user-roles';

interface MenuItem {
  icon: string;
  label: string;
  route?: string;
  active: boolean;
  roles?: string[];
  children?: MenuItem[];
  permission?: string;
  badge?: number;
  excludeRoles?: string[]; // ✅ NEW: Roles to exclude
  featureFlag?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit {
  currentUser: User | null = null;
  isSuperAdmin = false;

  menuItems: MenuItem[] = [
    {
      icon: 'ri-pie-chart-line',
      label: 'Overview',
      route: '/main/dashboard',
      active: true,
      // No role restriction — all authenticated users see dashboard
    },
    {
      icon: 'ri-admin-line',
      label: 'System Admin',
      active: false,
      roles: ['super_admin'],
      children: [
        {
          icon: 'ri-user-add-line',
          label: 'Signup Requests',
          route: '/main/admin/signup-requests',
          active: false,
          roles: ['super_admin'],
        },
        {
          icon: 'ri-team-line',
          label: 'All Users',
          route: '/main/admin/users',
          active: false,
          roles: ['super_admin'],
        },
        {
          icon: 'ri-building-line',
          label: 'All Churches',
          route: '/main/admin/churches',
          active: false,
          roles: ['super_admin'],
        },
      ],
    },
    {
      icon: 'ri-hand-heart-line',
      label: 'My Giving',
      route: '/main/my-giving',
      active: false,
      roles: ['member'],
    },
    {
      icon: 'ri-group-line',
      label: 'Members',
      route: '/main/members',
      active: false,
      roles: ['church_admin', 'pastor', 'group_leader', 'ministry_leader'], // ADD
      permission: 'members.view',
      excludeRoles: ['super_admin', 'member'],
    },
    {
      icon: 'ri-calendar-check-line',
      label: 'Attendance',
      route: '/main/attendance',
      active: false,
      roles: ['church_admin', 'pastor', 'group_leader', 'ministry_leader'], // ADD
      permission: 'attendance.view',
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-money-dollar-circle-line',
      label: 'Finance',
      route: '/main/finance',
      active: false,
      roles: ['church_admin', 'finance_officer'],
      permission: 'finance.view',
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-team-line',
      label: 'Departments',
      route: '/main/ministries',
      active: false,
      roles: ['church_admin', 'pastor', 'ministry_leader'], // ADD
      permission: 'ministries.view',
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-building-2-line',
      label: 'Branches',
      route: '/main/branches',
      active: false,
      roles: ['church_admin'],
      permission: 'branches.view',
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-calendar-event-line',
      label: 'Events',
      route: '/main/events',
      active: false,
      roles: ['church_admin', 'pastor', 'ministry_leader', 'group_leader'], // ADD
      permission: 'events.view',
      excludeRoles: ['super_admin', 'member'],
    },
    {
      icon: 'ri-chat-3-line',
      label: 'Communication',
      route: '/main/communications',
      active: false,
      roles: ['church_admin', 'pastor'],
      permission: 'communications.view',
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-shield-user-line',
      label: 'User Roles',
      route: '/main/user-roles',
      active: false,
      roles: ['church_admin'],
      permission: 'users.permissions',
      excludeRoles: ['super_admin'],
    },

    {
      icon: 'ri-bar-chart-line',
      label: 'Reports',
      route: '/main/reports',
      active: false,
      roles: ['church_admin', 'pastor', 'finance_officer'],
      permission: 'reports.view',
      excludeRoles: ['super_admin', 'member'],
      featureFlag: 'reports',
    },
    {
      icon: 'ri-settings-3-line',
      label: 'Settings',
      route: '/main/settings',
      active: false,
      permission: 'settings.view',
      excludeRoles: ['super_admin'],
    },
  ];

  filteredMenuItems: MenuItem[] = [];
  expandedItems: Set<string> = new Set();
  isMobileMenuOpen = false;
  isMobile = false;

  constructor(
    private router: Router,
    public authService: AuthService,
    private sidebarService: SidebarService,
    private userRolesService: UserRolesService,
  ) {}

  ngOnInit(): void {
    this.checkScreenSize();

    // Get current user
    this.authService.currentProfile$.subscribe((profile) => {
      this.currentUser = profile;
      this.isSuperAdmin = profile?.role === 'super_admin';
      this.filterMenuByRole();
    });

    // Subscribe to sidebar state
    this.sidebarService.sidebarOpen$.subscribe((isOpen) => {
      this.isMobileMenuOpen = isOpen;
    });

    // Set active menu item based on current route
    this.updateActiveMenuItem(this.router.url);

    // Listen to route changes
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.updateActiveMenuItem(event.url);
        if (this.isMobile) {
          this.sidebarService.close();
        }
      });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.sidebarService.close();
    }
  }

  private filterMenuByRole(): void {
    if (!this.currentUser) {
      this.filteredMenuItems = [];
      return;
    }

    this.filteredMenuItems = this.menuItems.filter((item) => {
      if (item.excludeRoles?.includes(this.currentUser!.role)) return false;

      // ← add this block
      if (
        item.featureFlag &&
        !this.authService.hasChurchFeature(item.featureFlag)
      ) {
        return false;
      }

      const hasRole =
        !item.roles || item.roles.length === 0
          ? true
          : item.roles.includes(this.currentUser!.role);

      const hasPermission = item.permission
        ? this.userRolesService.hasPermission(item.permission)
        : false;

      const canAccess = hasRole || hasPermission;
      if (!canAccess) return false;

      if (item.children) {
        item.children = item.children.filter((child) => {
          if (child.excludeRoles?.includes(this.currentUser!.role))
            return false;
          // ← and this for children
          if (
            child.featureFlag &&
            !this.authService.hasChurchFeature(child.featureFlag)
          )
            return false;
          const childHasRole =
            !child.roles || child.roles.length === 0
              ? true
              : child.roles.includes(this.currentUser!.role);
          const childHasPermission = child.permission
            ? this.userRolesService.hasPermission(child.permission)
            : false;
          return childHasRole || childHasPermission;
        });
      }

      return true;
    });
  }

  private updateActiveMenuItem(url: string): void {
    this.filteredMenuItems.forEach((item) => {
      if (item.route) {
        item.active = url.startsWith(item.route);
      } else if (item.children) {
        // Check if any child is active
        const hasActiveChild = item.children.some(
          (child) => child.route && url.startsWith(child.route),
        );
        item.active = hasActiveChild;

        // Auto-expand if has active child
        if (hasActiveChild) {
          this.expandedItems.add(item.label);
        }

        // Update children active state
        item.children.forEach((child) => {
          if (child.route) {
            child.active = url.startsWith(child.route);
          }
        });
      }
    });
  }

  toggleSubmenu(item: MenuItem): void {
    if (this.expandedItems.has(item.label)) {
      this.expandedItems.delete(item.label);
    } else {
      this.expandedItems.add(item.label);
    }
  }

  isExpanded(item: MenuItem): boolean {
    return this.expandedItems.has(item.label);
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  closeSidebar(): void {
    this.sidebarService.close();
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
  }
}
