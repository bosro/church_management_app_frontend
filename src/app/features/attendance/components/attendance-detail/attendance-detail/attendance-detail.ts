// src/app/features/attendance/components/attendance-detail/attendance-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../../services/attendance.service';
import {
  AttendanceEvent,
  AttendanceRecord,
} from '../../../../../models/attendance.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';

@Component({
  selector: 'app-attendance-detail',
  standalone: false,
  templateUrl: './attendance-detail.html',
  styleUrl: './attendance-detail.scss',
})
export class AttendanceDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: AttendanceEvent | null = null;
  attendanceRecords: AttendanceRecord[] = [];
  loading = true;
  errorMessage = '';

  // Permissions
  canManageAttendance = false;
  canMarkAttendance = false;

  allCellGroups: { id: string; name: string }[] = [];
  selectedCellGroupFilter = '';
  filteredAttendanceRecords: AttendanceRecord[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    if (this.eventId) {
      this.loadEventDetails();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
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

  private loadEventDetails(): void {
    this.loading = true;
    this.attendanceService
      .getAttendanceEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loading = false;
        },
      });

    this.loadAttendanceRecords();
  }


  private loadAttendanceRecords(): void {
    this.attendanceService
      .getAttendanceRecords(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.attendanceRecords = records;
          this.filteredAttendanceRecords = records; // start unfiltered

          // Extract unique cell groups from the records
          const groupMap = new Map<string, string>();
          records.forEach((r) => {
            const cg = (r.member as any)?.cell_group;
            if (cg?.id && cg?.name) groupMap.set(cg.id, cg.name);
          });
          this.allCellGroups = Array.from(groupMap.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        error: (error) => {
          console.error('Error loading records:', error);
        },
      });
  }

  onCellGroupFilterChange(): void {
    if (!this.selectedCellGroupFilter) {
      this.filteredAttendanceRecords = this.attendanceRecords;
      return;
    }
    this.filteredAttendanceRecords = this.attendanceRecords.filter((r) => {
      const cg = (r.member as any)?.cell_group;
      return cg?.id === this.selectedCellGroupFilter;
    });
  }

  // ADD summary helpers:
  get presentCount(): number {
    return this.filteredAttendanceRecords.filter((r) => r.status === 'present')
      .length;
  }

  get absentCount(): number {
    return this.filteredAttendanceRecords.filter((r) => r.status === 'absent')
      .length;
  }

  goBack(): void {
    this.router.navigate(['main/attendance']);
  }

  markAttendance(): void {
    if (!this.canMarkAttendance) {
      this.errorMessage = 'You do not have permission to mark attendance';
      return;
    }
    this.router.navigate(['main/attendance', this.eventId, 'mark']);
  }

  exportReport(): void {
    this.attendanceService
      .exportAttendanceReport(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const filename = `attendance_${this.event?.event_name}_${new Date().toISOString().split('T')[0]}.csv`;
          a.download = filename.replace(/\s+/g, '_');
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export report';
          console.error('Export error:', error);
        },
      });
  }

  deleteEvent(): void {
    if (!this.canManageAttendance) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }

    if (!this.event) return;

    const confirmMessage =
      this.event.total_attendance > 0
        ? `This event has ${this.event.total_attendance} attendance records. Are you sure you want to delete it?`
        : 'Are you sure you want to delete this event?';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.attendanceService
      .deleteAttendanceEvent(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['main/attendance']);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
          console.error('Delete error:', error);
        },
      });
  }

  // Helper methods
  getAttendanceName(record: AttendanceRecord): string {
    if (record.member) {
      return `${record.member.first_name} ${record.member.last_name}`;
    }
    if (record.visitor) {
      return `${record.visitor.first_name} ${record.visitor.last_name}`;
    }
    return 'Unknown';
  }

  getAttendanceType(record: AttendanceRecord): string {
    return record.member ? 'Member' : 'Visitor';
  }

  getMemberNumber(record: AttendanceRecord): string {
    return record.member?.member_number || 'N/A';
  }

  getCheckInTime(record: AttendanceRecord): string {
    return new Date(record.checked_in_at).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getMemberInitials(record: AttendanceRecord): string {
    if (record.member) {
      return `${record.member.first_name[0]}${record.member.last_name[0]}`.toUpperCase();
    }
    if (record.visitor) {
      return `${record.visitor.first_name[0]}${record.visitor.last_name[0]}`.toUpperCase();
    }
    return '?';
  }

  calculateAttendanceRate(): number {
    if (
      !this.event?.expected_attendance ||
      this.event.expected_attendance === 0
    ) {
      return 0;
    }
    return Math.round(
      (this.event.total_attendance / this.event.expected_attendance) * 100,
    );
  }

  getAttendanceRateClass(): string {
    const rate = this.calculateAttendanceRate();
    if (rate >= 80) return 'rate-high';
    if (rate >= 50) return 'rate-medium';
    return 'rate-low';
  }

  getCreatedByName(): string | null {
    const profile = (this.event as any)?.created_by_profile;
    return profile?.full_name || null;
  }

  getCellGroupName(record: AttendanceRecord): string {
    const cellGroup = (record.member as any)?.cell_group;
    return cellGroup?.name || '—';
  }
}




