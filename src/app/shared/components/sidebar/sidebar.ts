
// src/app/shared/components/sidebar/sidebar.component.ts
import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { User } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth';

interface MenuItem {
  icon: string;
  label: string;
  route: string;
  active: boolean;
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
    { icon: 'ri-pie-chart-line', label: 'Overview', route: 'main/dashboard', active: true },
    { icon: 'ri-group-line', label: 'Members', route: 'main/members', active: false },
    { icon: 'ri-calendar-check-line', label: 'Attendance', route: 'main/attendance', active: false },
    { icon: 'ri-money-dollar-circle-line', label: 'Finance', route: 'main/finance', active: false },
    { icon: 'ri-team-line', label: 'Departments', route: 'main/ministries', active: false },
    { icon: 'ri-building-line', label: 'Branches', route: 'main/branches', active: false },
    { icon: 'ri-calendar-event-line', label: 'Events', route: 'main/events', active: false },
    { icon: 'ri-chat-3-line', label: 'Communication', route: 'main/communications', active: false },
    { icon: 'ri-admin-line', label: 'User Roles', route: 'main/user-roles', active: false },
    { icon: 'ri-settings-3-line', label: 'Settings', route: 'main/settings', active: false }
  ];

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Get current user
    this.authService.currentProfile$.subscribe(profile => {
      this.currentUser = profile;
    });

    // Set active menu item based on current route
    this.updateActiveMenuItem(this.router.url);

    // Listen to route changes
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.updateActiveMenuItem(event.url);
      });
  }

  private updateActiveMenuItem(url: string): void {
    this.menuItems.forEach(item => {
      item.active = url.startsWith(item.route);
    });
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
  }
}
