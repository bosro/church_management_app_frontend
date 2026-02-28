// src/app/features/dashboard/components/overview/overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { DashboardSummary } from '../../../../models/statistics.model';
import { SupabaseService } from '../../../../core/services/supabase';
import { AuthService } from '../../../../core/services/auth';

interface UpcomingBirthday {
  id: string;
  name: string;
  location: string;
  date: string;
  age: number;
  phone: string;
  status: 'Today' | 'Tomorrow' | 'Passed';
  avatar?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

@Component({
  selector: 'app-overview',
  standalone: false,
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  churchId?: string;
  userRole?: string;
  hasError = false;
  errorMessage = '';

  // Dashboard Stats
  dashboardStats: DashboardSummary | null = null;

  // Upcoming Birthdays
  upcomingBirthdays: UpcomingBirthday[] = [];

  // Team Lists
  pastors: TeamMember[] = [];
  shepherds: TeamMember[] = [];

  // Revenue Chart Data (for current year)
  revenueData = {
    labels: [] as string[],
    tithe: [] as number[],
    offering: [] as number[],
    seed: [] as number[],
  };

  // Quick action permissions
  canAddMembers = false;
  canCheckIn = false;
  canCreateEvent = false;
  canRecordGiving = false;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // ✅ Wait for the profile to be loaded
    this.authService.currentProfile$
      .pipe(
        takeUntil(this.destroy$),
        filter(profile => profile !== null) // Only proceed when profile is loaded
      )
      .subscribe(profile => {
        this.churchId = profile?.church_id;
        this.userRole = profile?.role;

        this.setPermissions();

        if (this.churchId) {
          this.loadDashboardData();
        } else {
          this.hasError = true;
          this.errorMessage = 'No church assigned to your account. Please contact administrator.';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  private setPermissions(): void {
    const adminRoles = ['super_admin', 'church_admin', 'pastor'];
    const financeRoles = ['super_admin', 'church_admin', 'finance_officer'];

    this.canAddMembers = this.authService.hasRole(adminRoles);
    this.canCheckIn = this.authService.hasRole([...adminRoles, 'group_leader']);
    this.canCreateEvent = this.authService.hasRole(adminRoles);
    this.canRecordGiving = this.authService.hasRole(financeRoles);
  }

  private async loadDashboardData(): Promise<void> {
    this.loading = true;
    this.hasError = false;

    try {
      // Refresh materialized view first
      await this.refreshDashboardView();

      // Load all data in parallel
      await Promise.all([
        this.loadDashboardSummary(),
        this.loadUpcomingBirthdays(),
        this.loadTeamMembers(),
        this.loadRevenueData(),
      ]);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      this.hasError = true;
      this.errorMessage =
        'Failed to load dashboard data. Please try refreshing the page.';
    } finally {
      this.loading = false;
    }
  }

  private async refreshDashboardView(): Promise<void> {
    try {
      await this.supabase.callFunction('refresh_dashboard_summary', {});
    } catch (error) {
      console.warn('Could not refresh dashboard view:', error);
      // Don't throw - continue with existing data
    }
  }

  private async loadDashboardSummary(): Promise<void> {
    const { data, error } = await this.supabase.query<DashboardSummary>(
      'dashboard_church_summary',
      {
        filters: { church_id: this.churchId },
        limit: 1,
      },
    );

    if (error) {
      console.error('Error loading dashboard summary:', error);
      throw error;
    }

    if (data && data.length > 0) {
      this.dashboardStats = data[0];
    }
  }

  private async loadUpcomingBirthdays(): Promise<void> {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    const { data, error } = await this.supabase.client
      .from('upcoming_birthdays')
      .select('*')
      .eq('church_id', this.churchId)
      .gte('celebration_date', today.toISOString().split('T')[0])
      .lte('celebration_date', thirtyDaysLater.toISOString().split('T')[0])
      .order('celebration_date', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error loading birthdays:', error);
      throw error;
    }

    if (data) {
      this.upcomingBirthdays = data.map((birthday: any) => {
        const celebrationDate = new Date(birthday.celebration_date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const tomorrow = new Date(todayDate);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let status: 'Today' | 'Tomorrow' | 'Passed' = 'Passed';
        if (celebrationDate.toDateString() === todayDate.toDateString()) {
          status = 'Today';
        } else if (celebrationDate.toDateString() === tomorrow.toDateString()) {
          status = 'Tomorrow';
        }

        return {
          id: birthday.id,
          name: `${birthday.first_name} ${birthday.last_name}`,
          location: birthday.city || birthday.address || 'Not specified',
          date: this.formatDate(birthday.next_birthday),
          age: birthday.age + 1, // Next age
          phone: birthday.phone_primary || '',
          status: status,
          avatar: undefined,
        };
      });
    }
  }

  private async loadTeamMembers(): Promise<void> {
    // Load pastors using the view
    const { data: pastorData, error: pastorError } = await this.supabase.client
      .from('members_with_roles')
      .select('id, first_name, last_name, photo_url, profile_role')
      .eq('church_id', this.churchId)
      .in('profile_role', ['pastor', 'senior_pastor', 'associate_pastor'])
      .limit(6);

    if (!pastorError && pastorData) {
      this.pastors = pastorData.map((p: any) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        role: 'Pastor',
        avatar: p.photo_url,
      }));
    }

    // Load shepherds/group leaders
    const { data: shepherdData, error: shepherdError } =
      await this.supabase.client
        .from('members_with_roles')
        .select('id, first_name, last_name, photo_url, profile_role')
        .eq('church_id', this.churchId)
        .in('profile_role', ['group_leader', 'elder'])
        .limit(6);

    if (!shepherdError && shepherdData) {
      this.shepherds = shepherdData.map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        role: 'Group Leader',
        avatar: s.photo_url,
      }));
    }
  }

  private async loadRevenueData(): Promise<void> {
    const currentYear = new Date().getFullYear();

    // Get monthly giving for current year grouped by category
    const { data, error } = await this.supabase.client
      .from('monthly_giving_summary')
      .select('*')
      .eq('church_id', this.churchId)
      .eq('year', currentYear)
      .order('month', { ascending: true });

    if (error) {
      console.error('Error loading revenue data:', error);
      // Use empty data
      this.revenueData = {
        labels: [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ],
        tithe: Array(12).fill(0),
        offering: Array(12).fill(0),
        seed: Array(12).fill(0),
      };
      return;
    }

    if (data && data.length > 0) {
      // Initialize arrays
      const labels: string[] = [];
      const tithe: number[] = [];
      const offering: number[] = [];
      const seed: number[] = [];

      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      // Fill in the data
      for (let i = 1; i <= 12; i++) {
        const monthData = data.find((d) => d.month === i);
        labels.push(monthNames[i - 1]);
        tithe.push(monthData?.total_amount || 0);
        offering.push(0); // Will calculate from category breakdown
        seed.push(0);
      }

      this.revenueData = { labels, tithe, offering, seed };
    }
  }

  // Quick Actions (with permission checks)
  navigateToAddMembers(): void {
    if (!this.canAddMembers) {
      alert('You do not have permission to add members');
      return;
    }
    this.router.navigate(['main/members/add']);
  }

  navigateToCheckIn(): void {
    if (!this.canCheckIn) {
      alert('You do not have permission to check in members');
      return;
    }
    this.router.navigate(['main/attendance/check-in']);
  }

  navigateToCreateEvent(): void {
    if (!this.canCreateEvent) {
      alert('You do not have permission to create events');
      return;
    }
    this.router.navigate(['main/events/create']);
  }

  navigateToRecordGiving(): void {
    if (!this.canRecordGiving) {
      alert('You do not have permission to record giving');
      return;
    }
    this.router.navigate(['main/finance/record-giving']);
  }

  // Navigation helpers
  viewAllBirthdays(): void {
    this.router.navigate(['main/members'], {
      queryParams: { filter: 'birthdays' },
    });
  }

  viewMember(memberId: string): void {
    this.router.navigate(['main/members', memberId]);
  }

  retryLoad(): void {
    this.loadDashboardData();
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
}
