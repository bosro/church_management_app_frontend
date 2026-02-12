// src/app/features/dashboard/components/overview/overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

interface Pastor {
  id: string;
  name: string;
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

  // Dashboard Stats
  dashboardStats: DashboardSummary | null = null;

  // Upcoming Birthdays
  upcomingBirthdays: UpcomingBirthday[] = [];

  // Team Lists
  pastors: Pastor[] = [];
  shepherds: Pastor[] = [];

  // Revenue Chart Data
  revenueData = {
    labels: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ],
    tithe: [30, 40, 35, 50, 45, 60, 55, 70, 65, 80, 75, 85],
    offering: [25, 30, 40, 35, 50, 45, 60, 55, 70, 60, 75, 70],
  };

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.churchId = this.authService.getChurchId();
    if (this.churchId) {
      this.loadDashboardData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadDashboardData(): Promise<void> {
    this.loading = true;

    try {
      // Load dashboard summary
      await this.loadDashboardSummary();

      // Load upcoming birthdays
      await this.loadUpcomingBirthdays();

      // Load team members
      await this.loadTeamMembers();

      // Load revenue data
      await this.loadRevenueData();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.loading = false;
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

    if (!error && data && data.length > 0) {
      this.dashboardStats = data[0];
    }
  }

  private async loadUpcomingBirthdays(): Promise<void> {
    // Get upcoming birthdays from view
    const { data, error } = await this.supabase.client
      .from('upcoming_birthdays')
      .select('*')
      .eq('church_id', this.churchId)
      .gte('celebration_date', new Date().toISOString().split('T')[0])
      .order('celebration_date', { ascending: true })
      .limit(10);

    if (!error && data) {
      this.upcomingBirthdays = data.map((birthday: any) => {
        const celebrationDate = new Date(birthday.celebration_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let status: 'Today' | 'Tomorrow' | 'Passed' = 'Passed';
        if (celebrationDate.toDateString() === today.toDateString()) {
          status = 'Today';
        } else if (celebrationDate.toDateString() === tomorrow.toDateString()) {
          status = 'Tomorrow';
        }

        return {
          id: birthday.id,
          name: `${birthday.first_name} ${birthday.last_name}`,
          location: '6096 Marjolaine Landing', // Mock data
          date: birthday.next_birthday,
          age: birthday.age,
          phone: birthday.phone_primary || '0000000000',
          status: status,
          avatar: undefined,
        };
      });
    }
  }

  private async loadTeamMembers(): Promise<void> {
    // Load pastors
    const { data: pastorData } = await this.supabase.query('members', {
      select: 'id, first_name, last_name, photo_url',
      filters: { church_id: this.churchId },
      limit: 6,
    });

    if (pastorData) {
      this.pastors = pastorData.map((p: any) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        avatar: p.photo_url,
      }));
    }

    // Load shepherds (same query for now, you can add role filter)
    const { data: shepherdData } = await this.supabase.query('members', {
      select: 'id, first_name, last_name, photo_url',
      filters: { church_id: this.churchId },
      limit: 6,
    });

    if (shepherdData) {
      this.shepherds = shepherdData.map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        avatar: s.photo_url,
      }));
    }
  }

  private async loadRevenueData(): Promise<void> {
    // Get giving trends for current year
    const { data, error } = await this.supabase.callFunction<any>(
      'get_giving_trends',
      {
        church_uuid: this.churchId,
        months_back: 12,
      },
    );

    if (!error && data) {
      // Process data for chart
      // This is simplified - you'd map actual data here
      console.log('Revenue data loaded:', data);
    }
  }

  // Quick Actions
  navigateToAddMembers(): void {
    this.router.navigate(['main/members/add']);
  }

  navigateToCheckIn(): void {
    this.router.navigate(['main/attendance/check-in']);
  }

  navigateToCreateEvent(): void {
    this.router.navigate(['main/events/create']);
  }

  navigateToRecordGiving(): void {
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

  getStatusClass(status: string): string {
    switch (status) {
      case 'Today':
        return 'status-today';
      case 'Tomorrow':
        return 'status-tomorrow';
      case 'Passed':
        return 'status-passed';
      default:
        return '';
    }
  }

  formatPhone(phone: string): string {
    // Format phone number: 0555440404 -> 0555 440 404
    if (phone.length === 10) {
      return `${phone.substring(0, 4)} ${phone.substring(4, 7)} ${phone.substring(7)}`;
    }
    return phone;
  }
}
