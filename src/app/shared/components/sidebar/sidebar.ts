// src/app/shared/components/sidebar/sidebar.component.ts
import { Component, OnInit, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { User } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth';
import { SidebarService } from '../../../core/services/sidebar.service';

interface MenuItem {
  icon: string;
  label: string;
  route?: string;
  active: boolean;
  roles?: string[];
  children?: MenuItem[];
  badge?: number;
  excludeRoles?: string[]; // ✅ NEW: Roles to exclude
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
    },
    // ✅ Super Admin Section - ONLY for super_admin
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
    // ✅ Church Operations - EXCLUDE super_admin
    {
      icon: 'ri-group-line',
      label: 'Members',
      route: '/main/members',
      active: false,
      roles: ['church_admin', 'pastor', 'group_leader'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-calendar-check-line',
      label: 'Attendance',
      route: '/main/attendance',
      active: false,
      roles: ['church_admin', 'pastor', 'group_leader'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-money-dollar-circle-line',
      label: 'Finance',
      route: '/main/finance',
      active: false,
      roles: ['church_admin', 'finance_officer'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-team-line',
      label: 'Departments',
      route: '/main/ministries',
      active: false,
      roles: ['church_admin', 'pastor'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-building-2-line',
      label: 'Branches',
      route: '/main/branches',
      active: false,
      roles: ['church_admin'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-calendar-event-line',
      label: 'Events',
      route: '/main/events',
      active: false,
      roles: ['church_admin', 'pastor'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-chat-3-line',
      label: 'Communication',
      route: '/main/communications',
      active: false,
      roles: ['church_admin', 'pastor'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-shield-user-line',
      label: 'User Roles',
      route: '/main/user-roles',
      active: false,
      roles: ['church_admin'],
      excludeRoles: ['super_admin'], // ✅ Hide from super_admin
    },
    {
      icon: 'ri-settings-3-line',
      label: 'Settings',
      route: '/main/settings',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
    },
  ];

  filteredMenuItems: MenuItem[] = [];
  expandedItems: Set<string> = new Set();
  isMobileMenuOpen = false;
  isMobile = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private sidebarService: SidebarService,
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
      // ✅ Check if current role is excluded
      if (item.excludeRoles && item.excludeRoles.includes(this.currentUser!.role)) {
        return false;
      }

      if (!item.roles || item.roles.length === 0) {
        return true;
      }
      const hasAccess = item.roles.includes(this.currentUser!.role);

      // Filter children too
      if (hasAccess && item.children) {
        item.children = item.children.filter(child => {
          // ✅ Check exclusions for children
          if (child.excludeRoles && child.excludeRoles.includes(this.currentUser!.role)) {
            return false;
          }
          if (!child.roles || child.roles.length === 0) {
            return true;
          }
          return child.roles.includes(this.currentUser!.role);
        });
      }

      return hasAccess;
    });
  }

  private updateActiveMenuItem(url: string): void {
    this.filteredMenuItems.forEach((item) => {
      if (item.route) {
        item.active = url.startsWith(item.route);
      } else if (item.children) {
        // Check if any child is active
        const hasActiveChild = item.children.some(child =>
          child.route && url.startsWith(child.route)
        );
        item.active = hasActiveChild;

        // Auto-expand if has active child
        if (hasActiveChild) {
          this.expandedItems.add(item.label);
        }

        // Update children active state
        item.children.forEach(child => {
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
