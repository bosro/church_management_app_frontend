// src/app/features/dashboard/components/overview/overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { DashboardSummary } from '../../../../models/statistics.model';
import { SupabaseService } from '../../../../core/services/supabase';
import { AuthService } from '../../../../core/services/auth';
import { EventsService } from '../../../events/services/events'; // ✅ ADD THIS
import { PermissionService } from '../../../../core/services/permission.service';

interface UpcomingBirthday {
  id: string;
  name: string;
  location: string;
  date: string;
  age: number;
  phone: string;
  status: 'Today' | 'Tomorrow' | 'Upcoming';
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

  dashboardStats: DashboardSummary | null = null;
  upcomingBirthdays: UpcomingBirthday[] = [];
  pastors: TeamMember[] = [];
  shepherds: TeamMember[] = [];

  revenueData = {
    labels: [] as string[],
    tithe: [] as number[],
    offering: [] as number[],
    seed: [] as number[],
  };

  canAddMembers = false;
  canCheckIn = false;
  canCreateEvent = false;
  canRecordGiving = false;
  canViewRevenue = false;
  canViewQuickActions = false;
  isSuperAdmin = false;
  upcomingEvents: any[] = [];
  canViewAge = false;
  canViewAllEvents = false;
  canViewAllBirthdays = false; // ✅ NEW

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private eventsService: EventsService, // ✅ ADD THIS
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.authService.currentProfile$
      .pipe(
        takeUntil(this.destroy$),
        filter((profile) => profile !== null),
      )
      .subscribe((profile) => {
        this.isSuperAdmin = profile?.role === 'super_admin';

        if (this.isSuperAdmin) {
          this.router.navigate(['/main/admin/dashboard']);
          return;
        }

        this.churchId = profile?.church_id;
        this.userRole = profile?.role;

        this.setPermissions();

        if (this.churchId) {
          this.loadDashboardData();
        } else {
          this.hasError = true;
          this.errorMessage =
            'No church assigned to your account. Please contact administrator.';
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

    // Role-based OR permission-based — sub-users with granted permissions get access too
    this.canAddMembers =
      this.authService.hasRole(adminRoles) ||
      this.permissionService.members.create;

    this.canCheckIn =
      this.authService.hasRole([...adminRoles, 'group_leader']) ||
      this.permissionService.attendance.checkin;

    this.canCreateEvent =
      this.authService.hasRole(adminRoles) ||
      this.permissionService.events.create;

    this.canRecordGiving =
      this.authService.hasRole(financeRoles) ||
      this.permissionService.finance.record;

    this.canViewAge =
      this.authService.hasRole(adminRoles) ||
      this.permissionService.members.view;

    this.canViewRevenue =
      this.authService.hasRole([...adminRoles, ...financeRoles]) ||
      this.permissionService.finance.view;

    this.canViewQuickActions =
      !this.authService.hasRole(['member']) ||
      this.permissionService.isAdmin ||
      this.canAddMembers ||
      this.canCheckIn ||
      this.canCreateEvent ||
      this.canRecordGiving;

    this.canViewAllEvents =
      this.authService.hasRole(adminRoles) ||
      this.permissionService.events.view;

    this.canViewAllBirthdays =
      this.authService.hasRole(adminRoles) ||
      this.permissionService.members.view;
  }

  private async loadDashboardData(): Promise<void> {
    this.loading = true;
    this.hasError = false;

    try {
      await this.refreshDashboardView();

      const promises = [
        this.loadDashboardSummary(),
        this.loadUpcomingBirthdays(),
        this.loadTeamMembers(),
        this.loadUpcomingEvents(), // ✅ Always load events
      ];

      if (this.canViewRevenue) {
        promises.push(this.loadRevenueData());
      }

      await Promise.all(promises);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      this.hasError = true;
      this.errorMessage =
        'Failed to load dashboard data. Please try refreshing the page.';
    } finally {
      this.loading = false;
    }
  }

  private formatDateWithoutYear(dateString: string): string {
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
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  // ✅ FIXED: Use EventsService instead of direct query
  private loadUpcomingEvents(): Promise<void> {
    console.log('📅 Loading upcoming events for dashboard...');

    return new Promise((resolve) => {
      this.eventsService
        .getUpcomingEvents(5)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (events) => {
            console.log('✅ Events loaded successfully:', events.length);

            this.upcomingEvents = events.map((event: any) => ({
              id: event.id,
              title: event.title,
              date: this.formatDateWithoutYear(event.start_date),
              time:
                event.start_time || this.extractTime(event.start_date) || 'TBA',
              location: event.location || 'TBA',
              type: event.category || 'other',
              attendees: event.max_attendees,
            }));

            console.log('📅 Formatted events:', this.upcomingEvents);
            resolve();
          },
          error: (error) => {
            console.error('❌ Error loading events:', {
              error,
              message: error?.message,
              churchId: this.churchId,
              userRole: this.userRole,
            });

            this.upcomingEvents = [];
            resolve(); // Don't reject - just show empty
          },
        });
    });
  }

  // ✅ ADD: Helper to extract time from datetime string
  private extractTime(datetime: string): string {
    if (!datetime) return '';
    try {
      const date = new Date(datetime);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  }

  private async refreshDashboardView(): Promise<void> {
    try {
      await this.supabase.callFunction('refresh_dashboard_summary', {});
    } catch (error) {
      console.warn('Could not refresh dashboard view:', error);
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
        celebrationDate.setHours(0, 0, 0, 0);

        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        const tomorrow = new Date(todayDate);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let status: 'Today' | 'Tomorrow' | 'Upcoming' = 'Upcoming';

        if (celebrationDate.getTime() === todayDate.getTime()) {
          status = 'Today';
        } else if (celebrationDate.getTime() === tomorrow.getTime()) {
          status = 'Tomorrow';
        }

        return {
          id: birthday.id,
          name: `${birthday.first_name} ${birthday.last_name}`,
          location: birthday.city || birthday.address || 'Not specified',
          date: this.formatDateWithoutYear(birthday.next_birthday),
          age: birthday.age + 1,
          phone: birthday.phone_primary || '',
          status: status,
          avatar: undefined,
        };
      });
    }
  }

  private async loadTeamMembers(): Promise<void> {
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

    const { data, error } = await this.supabase.client
      .from('monthly_giving_summary')
      .select('*')
      .eq('church_id', this.churchId)
      .eq('year', currentYear)
      .order('month', { ascending: true });

    if (error) {
      console.error('Error loading revenue data:', error);
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

      for (let i = 1; i <= 12; i++) {
        const monthData = data.find((d) => d.month === i);
        labels.push(monthNames[i - 1]);
        tithe.push(monthData?.total_amount || 0);
        offering.push(0);
        seed.push(0);
      }

      this.revenueData = { labels, tithe, offering, seed };
    }
  }

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

  viewAllBirthdays(): void {
    this.router.navigate(['main/members'], {
      queryParams: { filter: 'birthdays' },
    });
  }

  viewAllEvents(): void {
    this.router.navigate(['main/events']);
  }

  viewEvent(eventId: string): void {
    this.router.navigate(['main/events', eventId]);
  }

  viewMember(memberId: string): void {
    this.router.navigate(['main/members', memberId]);
  }

  retryLoad(): void {
    this.loadDashboardData();
  }
}
