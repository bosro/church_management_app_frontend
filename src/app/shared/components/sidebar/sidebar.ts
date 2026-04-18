// src/app/shared/components/sidebar/sidebar.component.ts
import { Component, OnInit, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { User } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth';
import { SidebarService } from '../../../core/services/sidebar.service';
import { UserRolesService } from '../../../features/user-roles/services/user-roles';
import { SubscriptionService } from '../../../core/services/subscription.service';

interface MenuItem {
  icon: string;
  label: string;
  route?: string;
  active: boolean;
  roles?: string[];
  children?: MenuItem[];
  permission?: string;
  badge?: number;
  excludeRoles?: string[];
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
        {
          icon: 'ri-price-tag-3-line',
          label: 'Subscription Plans',
          route: '/main/admin/plans',
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
      roles: [
        'church_admin',
        'pastor',
        'group_leader',
        'ministry_leader',
        'cell_leader',
      ], // ← add cell_leader
      permission: 'members.view',
      excludeRoles: ['super_admin', 'member'],
    },
    {
      icon: 'ri-calendar-check-line',
      label: 'Attendance',
      route: '/main/attendance',
      active: false,
      roles: [
        'church_admin',
        'pastor',
        'group_leader',
        'ministry_leader',
        'cell_leader',
      ], // ← add cell_leader
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
      roles: ['church_admin', 'pastor', 'ministry_leader'],
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
      icon: 'ri-group-2-line',
      label: 'Cell Groups',
      route: '/main/cells',
      active: false,
      roles: ['church_admin', 'pastor', 'group_leader', 'cell_leader'],
      permission: 'members.view',
      excludeRoles: ['super_admin', 'member'],
    },
    {
      icon: 'ri-calendar-event-line',
      label: 'Events',
      route: '/main/events',
      active: false,
      roles: ['church_admin', 'pastor', 'ministry_leader', 'group_leader'],
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
      icon: 'ri-award-line',
      label: 'Voting',
      route: '/main/voting',
      active: false,
      featureFlag: 'voting', // ← ADD
      roles: [
        'church_admin',
        'pastor',
        'member',
        'group_leader',
        'ministry_leader',
        'senior_pastor',
        'associate_pastor',
        'elder',
        'deacon',
        'worship_leader',
        'finance_officer',
      ],
      excludeRoles: ['super_admin'],
    },
    {
      icon: 'ri-briefcase-line',
      label: 'Job Hub',
      route: '/main/job-hub',
      active: false,
      featureFlag: 'job_hub', // ← ADD
      roles: [
        'church_admin',
        'pastor',
        'member',
        'group_leader',
        'ministry_leader',
        'senior_pastor',
        'associate_pastor',
        'elder',
        'deacon',
        'worship_leader',
        'finance_officer',
      ],
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
      children: [
        // ── Students ──────────────────────────────────
        {
          icon: 'ri-group-line',
          label: 'All Students',
          route: '/main/reports/students',
          active: false,
          roles: ['church_admin', 'pastor', 'finance_officer'],
        },
        {
          icon: 'ri-user-add-line',
          label: 'Add Student',
          route: '/main/reports/students/add',
          active: false,
          roles: ['church_admin'],
          permission: 'school.manage',
        },
        {
          icon: 'ri-building-line',
          label: 'Classes',
          route: '/main/reports/classes',
          active: false,
          roles: ['church_admin', 'pastor', 'finance_officer'],
        },
        // ── Fees ──────────────────────────────────────
        {
          icon: 'ri-file-list-3-line',
          label: 'Student Fees',
          route: '/main/reports/fees/students',
          active: false,
          roles: ['church_admin', 'finance_officer'],
          permission: 'school.fees',
        },
        {
          icon: 'ri-settings-3-line',
          label: 'Fee Structures',
          route: '/main/reports/fees/structures',
          active: false,
          roles: ['church_admin', 'finance_officer'],
          permission: 'school.fees',
        },
        {
          icon: 'ri-bar-chart-line',
          label: 'Fee Report',
          route: '/main/reports/fees/report',
          active: false,
          roles: ['church_admin', 'finance_officer'],
          permission: 'school.fees',
        },
        // ── Exams ─────────────────────────────────────
        // {
        //   icon: 'ri-file-list-line',
        //   label: 'All Exams',
        //   route: '/main/reports/exams',
        //   active: false,
        //   roles: ['church_admin', 'pastor', 'finance_officer'],
        //   permission: 'school.exams',
        // },
        // {
        //   icon: 'ri-add-circle-line',
        //   label: 'Create Exam',
        //   route: '/main/reports/exams/create',
        //   active: false,
        //   roles: ['church_admin'],
        // },
        // // ── Settings ──────────────────────────────────
        // {
        //   icon: 'ri-award-line',
        //   label: 'Grading Scale',
        //   route: '/main/reports/grading',
        //   active: false,
        //   roles: ['church_admin'],
        // },
        // {
        //   icon: 'ri-book-2-line',
        //   label: 'Subjects',
        //   route: '/main/reports/subjects',
        //   active: false,
        //   roles: ['church_admin'],
        // },
      ],
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

  bannerDismissed = false;

  subscriptionLoaded = false;

  constructor(
    private router: Router,
    public authService: AuthService,
    private sidebarService: SidebarService,
    private userRolesService: UserRolesService,
    public subscriptionService: SubscriptionService,
  ) {}

  ngOnInit(): void {
    this.checkScreenSize();
    this.bannerDismissed =
      sessionStorage.getItem('upgrade-banner-dismissed') === 'true';

    // Wait for subscription status to load before showing banner
    this.subscriptionService.status$.subscribe((status) => {
      this.subscriptionLoaded = status !== null;
    });

    this.authService.currentProfile$.subscribe((profile) => {
      this.currentUser = profile;
      this.isSuperAdmin = profile?.role === 'super_admin';
      this.filterMenuByRole();
    });

    this.sidebarService.sidebarOpen$.subscribe((isOpen) => {
      this.isMobileMenuOpen = isOpen;
    });

    this.updateActiveMenuItem(this.router.url);

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

  get currentPlanName(): string {
    return this.subscriptionService.currentTier === 'starter'
      ? 'Starter'
      : 'Free';
  }

  get showUpgradeBanner(): boolean {
    if (!this.subscriptionLoaded) return false; // ← don't flash before data loads
    if (this.bannerDismissed) return false;
    const role = this.currentUser?.role;
    if (!role || role === 'super_admin') return false;
    return this.subscriptionService.isFreeTier;
  }

  dismissBanner(): void {
    this.bannerDismissed = true;
    // Remember for this session
    sessionStorage.setItem('upgrade-banner-dismissed', 'true');
  }

  navigateToUpgrade(): void {
    this.router.navigate(['/main/settings'], {
      queryParams: { tab: 'subscription' },
    });
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

    this.filteredMenuItems = this.menuItems
      .filter((item) => {
        if (item.excludeRoles?.includes(this.currentUser!.role)) return false;
        if (
          item.featureFlag &&
          !this.authService.hasChurchFeature(item.featureFlag)
        )
          return false;

        const hasRole =
          !item.roles || item.roles.length === 0
            ? true
            : item.roles.includes(this.currentUser!.role);
        const hasPermission = item.permission
          ? this.userRolesService.hasPermission(item.permission)
          : false;

        return hasRole || hasPermission;
      })
      .map((item) => {
        // ← CRITICAL: spread to avoid mutating the original object
        if (!item.children) return { ...item };

        const filteredChildren = item.children.filter((child) => {
          if (child.excludeRoles?.includes(this.currentUser!.role))
            return false;
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

        return { ...item, children: filteredChildren };
      });
  }

  private updateActiveMenuItem(url: string): void {
    this.filteredMenuItems.forEach((item) => {
      if (item.children && item.children.length > 0) {
        // For items with children, check if any child matches
        const hasActiveChild = item.children.some(
          (child) => child.route && url.startsWith(child.route),
        );

        // Also check if the parent route itself is an exact match
        // (e.g. /main/reports overview page)
        const isParentExact = item.route
          ? url === item.route || url === item.route + '/'
          : false;

        item.active = hasActiveChild || isParentExact;

        // Auto-expand if a child is active
        if (hasActiveChild) {
          this.expandedItems.add(item.label);
        }

        item.children.forEach((child) => {
          if (child.route) {
            child.active = url.startsWith(child.route);
          }
        });
      } else if (item.route) {
        item.active = url.startsWith(item.route);
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
