// src/app/features/attendance/components/attendance-list/attendance-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import {
  AttendanceEvent,
  AttendanceEventType,
  AttendanceStatistics,
} from '../../../../models/attendance.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';
import { MemberService } from '../../../members/services/member.service';

@Component({
  selector: 'app-attendance-list',
  standalone: false,
  templateUrl: './attendance-list.html',
  styleUrl: './attendance-list.scss',
})
export class AttendanceList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  events: AttendanceEvent[] = [];
  loading = false;
  errorMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalEvents = 0;
  totalPages = 0;

  // Filters
  selectedEventType: AttendanceEventType | '' = '';
  eventTypes: { value: AttendanceEventType | ''; label: string }[] = [
    { value: '', label: 'All Events' },
    { value: 'sunday_service', label: 'Sunday Service' },
    { value: 'midweek_service', label: 'Midweek Service' },
    { value: 'ministry_meeting', label: 'Ministry Meeting' },
    { value: 'special_event', label: 'Special Event' },
    { value: 'prayer_meeting', label: 'Prayer Meeting' },
  ];

  // Statistics
  statistics: AttendanceStatistics | null = null;

  // Permissions
  canManageAttendance = false;
  canMarkAttendance = false;

  allCellGroups: { id: string; name: string }[] = [];
  selectedCellGroup = '';
  cellGroupStatsMap: Record<string, { present: number; absent: number }> = {};
  loadingCellStats = false;

  showDeleteModal = false;
  deleteTargetId = '';
  deleteTargetName = '';
  deleteTargetCount = 0;
  deleting = false;

  constructor(
    private attendanceService: AttendanceService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
    private memberService: MemberService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEvents();
    this.loadStatistics();
    this.loadCellGroups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    // console.log('🔍 ATTENDANCE-LIST role:', role, '| viewRoles.includes:', ['pastor','senior_pastor','associate_pastor','ministry_leader','group_leader','cell_leader','finance_officer','elder','deacon','worship_leader','secretary','usher'].includes(role));
    // console.log('🔍 ATTENDANCE checkPermissions — role:', role);
    // console.log('🔍 isAdmin:', this.permissionService.isAdmin);
    // console.log('🔍 attendance.view:', this.permissionService.attendance.view);

    const viewRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'finance_officer',
      'elder',
      'deacon',
      'worship_leader',
      'secretary',
      'usher',
    ];
    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
    ];
    const markRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'usher',
    ];

    const canView =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.view ||
      viewRoles.includes(role);

    if (!canView) {
      this.router.navigate(['/unauthorized']);
      return;
    }

    this.canManageAttendance =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.manage ||
      manageRoles.includes(role);
    this.canMarkAttendance =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.checkin ||
      markRoles.includes(role);
  }

  private loadCellGroups(): void {
    // Reuse memberService.getCellGroups() — already available
    // Or inject CellGroupsService if preferred
    this.memberService
      .getCellGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe((groups) => {
        this.allCellGroups = groups;
      });
  }

  onCellGroupFilterChange(): void {
    if (!this.selectedCellGroup) {
      // Clear cell group stats — show normal event totals
      this.cellGroupStatsMap = {};
      return;
    }

    // Load attendance stats scoped to this cell group
    this.loadingCellStats = true;
    this.attendanceService
      .getAttendanceRecordsByCellGroup(this.selectedCellGroup)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (statsMap) => {
          this.cellGroupStatsMap = statsMap;
          this.loadingCellStats = false;
        },
        error: () => {
          this.loadingCellStats = false;
        },
      });
  }

  // Helper for the template — returns scoped stats if a cell group is selected
  getCellScopedStats(
    eventId: string,
  ): { present: number; absent: number } | null {
    if (!this.selectedCellGroup) return null;
    return this.cellGroupStatsMap[eventId] || { present: 0, absent: 0 };
  }

  getSelectedCellGroupName(): string {
    const group = this.allCellGroups.find(
      (g) => g.id === this.selectedCellGroup,
    );
    return group?.name || '';
  }

  loadEvents(): void {
    console.log('kjnjnk');
    this.loading = true;
    this.errorMessage = '';

    const filters = this.selectedEventType
      ? { eventType: this.selectedEventType as AttendanceEventType }
      : undefined;

    this.attendanceService
      .getAttendanceEvents(this.currentPage, this.pageSize, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.events = data;
          this.totalEvents = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load events';
          this.loading = false;
          console.error('Error loading events:', error);
        },
      });
  }

  loadStatistics(): void {
    this.attendanceService
      .getAttendanceStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        },
      });
  }

  onEventTypeChange(): void {
    this.currentPage = 1;
    this.loadEvents();
  }

  // Navigation
  viewEvent(eventId: string): void {
    this.router.navigate(['main/attendance', eventId]);
  }

  createEvent(): void {
    if (!this.canManageAttendance) {
      this.errorMessage = 'You do not have permission to create events';
      return;
    }
    this.router.navigate(['main/attendance/create']);
  }

  markAttendance(eventId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canMarkAttendance) {
      this.errorMessage = 'You do not have permission to mark attendance';
      return;
    }
    this.router.navigate(['main/attendance', eventId, 'mark']);
  }

  viewReports(): void {
    this.router.navigate(['main/attendance/reports']);
  }

  viewVisitors(): void {
    this.router.navigate(['main/attendance/visitors']);
  }

  deleteEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canManageAttendance) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }
    const attendanceEvent = this.events.find((e) => e.id === eventId);
    if (!attendanceEvent) return;

    this.deleteTargetId = eventId;
    this.deleteTargetName = attendanceEvent.event_name;
    this.deleteTargetCount = attendanceEvent.total_attendance;
    this.showDeleteModal = true;
  }

  confirmDelete(): void {
    if (!this.deleteTargetId) return;
    this.deleting = true;

    this.attendanceService
      .deleteAttendanceEvent(this.deleteTargetId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deleting = false;
          this.showDeleteModal = false;
          this.loadEvents();
          this.loadStatistics();
        },
        error: (error) => {
          this.deleting = false;
          this.errorMessage = error.message || 'Failed to delete event';
        },
      });
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deleteTargetId = '';
    this.deleteTargetName = '';
    this.deleteTargetCount = 0;
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadEvents();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadEvents();
      this.scrollToTop();
    }
  }

  // Helper methods
  getEventTypeLabel(type: string): string {
    const eventType = this.eventTypes.find((et) => et.value === type);
    return eventType?.label || type;
  }

  getEventTypeClass(type: string): string {
    const typeMap: Record<string, string> = {
      sunday_service: 'type-sunday',
      midweek_service: 'type-midweek',
      ministry_meeting: 'type-ministry',
      special_event: 'type-special',
      prayer_meeting: 'type-prayer',
    };
    return typeMap[type] || '';
  }

  calculateAttendanceRate(event: AttendanceEvent): number {
    if (!event.expected_attendance || event.expected_attendance === 0) {
      return 0;
    }
    return Math.round(
      (event.total_attendance / event.expected_attendance) * 100,
    );
  }

  getAttendanceRateClass(rate: number): string {
    if (rate >= 80) return 'rate-high';
    if (rate >= 50) return 'rate-medium';
    return 'rate-low';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
