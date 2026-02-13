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
  route: string;
  active: boolean;
  roles?: string[];
}

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit {
  currentUser: User | null = null;
  menuItems: MenuItem[] = [
    {
      icon: 'ri-pie-chart-line',
      label: 'Overview',
      route: '/main/dashboard',
      active: true,
    },
    {
      icon: 'ri-group-line',
      label: 'Members',
      route: '/main/members',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
    },
    {
      icon: 'ri-calendar-check-line',
      label: 'Attendance',
      route: '/main/attendance',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
    },
    {
      icon: 'ri-money-dollar-circle-line',
      label: 'Finance',
      route: '/main/finance',
      active: false,
      roles: ['super_admin', 'church_admin', 'finance_officer'],
    },
    {
      icon: 'ri-team-line',
      label: 'Departments',
      route: '/main/ministries',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor'],
    },
    {
      icon: 'ri-building-line',
      label: 'Branches',
      route: '/main/branches',
      active: false,
      roles: ['super_admin', 'church_admin'],
    },
    {
      icon: 'ri-calendar-event-line',
      label: 'Events',
      route: '/main/events',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor'],
    },
    {
      icon: 'ri-chat-3-line',
      label: 'Communication',
      route: '/main/communications',
      active: false,
      roles: ['super_admin', 'church_admin', 'pastor'],
    },
    {
      icon: 'ri-admin-line',
      label: 'User Roles',
      route: '/main/user-roles',
      active: false,
      roles: ['super_admin', 'church_admin'],
    },
    {
      icon: 'ri-settings-3-line',
      label: 'Settings',
      route: '/main/settings',
      active: false,
    },
  ];

  filteredMenuItems: MenuItem[] = [];
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
      if (!item.roles || item.roles.length === 0) {
        return true;
      }
      return item.roles.includes(this.currentUser!.role);
    });
  }

  private updateActiveMenuItem(url: string): void {
    this.filteredMenuItems.forEach((item) => {
      item.active = url.startsWith(item.route);
    });
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
