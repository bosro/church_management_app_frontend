
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';

interface PlatformStats {
  total_churches: number;
  active_churches: number;
  total_users: number;
  active_users: number;
  pending_signups: number;
  signups_this_week: number;
  signups_this_month: number;
}

interface RecentActivity {
  id: string;
  type: 'signup' | 'approval' | 'church_created' | 'user_activated';
  description: string;
  timestamp: string;
  icon: string;
  color: string;
}

@Component({
 selector: 'app-super-admin-dashboard',
  standalone: false,
  templateUrl: './super-admin-dashboard.html',
  styleUrl: './super-admin-dashboard.scss',
})
export class SuperAdminDashboard implements OnInit {
  loading = true;
  stats: PlatformStats = {
    total_churches: 0,
    active_churches: 0,
    total_users: 0,
    active_users: 0,
    pending_signups: 0,
    signups_this_week: 0,
    signups_this_month: 0
  };

  recentActivity: RecentActivity[] = [];
  topChurches: any[] = [];

  constructor(
    private adminService: AdminService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  async loadDashboardData(): Promise<void> {
    this.loading = true;

    try {
      await Promise.all([
        this.loadPlatformStats(),
        this.loadRecentActivity(),
        this.loadTopChurches()
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      this.loading = false;
    }
  }

  private async loadPlatformStats(): Promise<void> {
    // Load churches
    this.adminService.getAllChurches().subscribe({
      next: (churches) => {
        this.stats.total_churches = churches.length;
        this.stats.active_churches = churches.filter(c => c.is_active).length;
      }
    });

    // Load users
    this.adminService.getAllUsers().subscribe({
      next: (users) => {
        this.stats.total_users = users.length;
        this.stats.active_users = users.filter(u => u.is_active).length;
      }
    });

    // Load signup requests
    this.adminService.getSignupRequests().subscribe({
      next: (requests) => {
        this.stats.pending_signups = requests.filter(r => r.status === 'pending').length;

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        this.stats.signups_this_week = requests.filter(r =>
          new Date(r.created_at) >= oneWeekAgo
        ).length;

        this.stats.signups_this_month = requests.filter(r =>
          new Date(r.created_at) >= oneMonthAgo
        ).length;
      }
    });
  }

  private async loadRecentActivity(): Promise<void> {
    // This would come from a real activity log table
    // For now, we'll generate mock data based on signup requests
    this.adminService.getSignupRequests().subscribe({
      next: (requests) => {
        this.recentActivity = requests.slice(0, 10).map(request => ({
          id: request.id,
          type: request.status === 'approved' ? 'approval' : 'signup',
          description: request.status === 'approved'
            ? `${request.full_name} was approved`
            : `${request.full_name} requested signup`,
          timestamp: request.created_at,
          icon: request.status === 'approved' ? 'ri-checkbox-circle-line' : 'ri-user-add-line',
          color: request.status === 'approved' ? '#10B981' : '#F59E0B'
        }));
      }
    });
  }

  private async loadTopChurches(): Promise<void> {
    this.adminService.getAllChurches().subscribe({
      next: (churches) => {
        // Sort by created date (most recent first) - in real app, sort by member count
        this.topChurches = churches
          .filter(c => c.is_active)
          .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
          .slice(0, 5);
      }
    });
  }

  navigateToSignupRequests(): void {
    this.router.navigate(['/main/admin/signup-requests']);
  }

  navigateToUsers(): void {
    this.router.navigate(['/main/admin/users']);
  }

  navigateToChurches(): void {
    this.router.navigate(['/main/admin/churches']);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  }
}




