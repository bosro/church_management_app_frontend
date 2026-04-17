// src/app/features/attendance/components/mark-attendance/mark-attendance.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { MemberService } from '../../../members/services/member.service';
import {
  AttendanceEvent,
  AttendanceRecord,
} from '../../../../models/attendance.model';
import { Member } from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

interface EnrichedMember extends Member {
  alreadyPresent?: boolean;
  alreadyAbsent?: boolean;
  recordId?: string;
}

@Component({
  selector: 'app-mark-attendance',
  standalone: false,
  templateUrl: './mark-attendance.html',
  styleUrl: './mark-attendance.scss',
})
export class MarkAttendance implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: AttendanceEvent | null = null;
  attendanceRecords: AttendanceRecord[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Search
  searchControl = new FormControl('');
  searchResults: EnrichedMember[] = [];
  searching = false;

  // Visitor form
  showVisitorForm = false;
  visitorName = '';
  visitorPhone = '';
  visitorEmail = '';
  addingVisitor = false;

  // Bulk
  selectedMembers: Set<string> = new Set();
  bulkCheckInMode = false;

  // QR
  qrCodeData = '';
  showQRCode = false;

  // Past event flag
  isEventPast = false;
  isEventToday = false;

  // Absence modal (for list items only)
  showAbsenceModal = false;
  absenceTargetRecord: AttendanceRecord | null = null;
  absenceTargetMemberId: string | null = null;
  absenceTargetName = '';
  absenceReason = '';
  markingAbsent = false;

  // Edit reason modal
  showEditReasonModal = false;
  editReasonRecord: AttendanceRecord | null = null;
  editReasonText = '';
  updatingReason = false;

  // Active tab
  activeTab: 'present' | 'absent' = 'present';

  // Spawn next occurrence
  hasNextOccurrence = false;
  spawningNext = false;

  canMarkAttendance = false;

  processingMemberIds = new Set<string>(); // tracks per-member loading state
  processingRecordIds = new Set<string>(); // tracks per-record loading state

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService,
    private membersService: MemberService,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    if (this.eventId) {
      this.loadEvent();
      this.loadAttendanceRecords();
      this.setupSearch();
      this.generateQRCode();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const markRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'usher',
    ];

    const canMark =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.checkin ||
      markRoles.includes(role);
    if (!canMark) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadEvent(): void {
    this.attendanceService
      .getAttendanceEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.isEventPast = this.attendanceService.isEventPast(
            event.event_date,
          );
          this.isEventToday = this.attendanceService.isEventToday(
            event.event_date,
          );

          // Check if recurring + past → see if next occurrence exists
          if (event.is_recurring && this.isEventPast) {
            this.attendanceService
              .hasNextOccurrence(event)
              .pipe(takeUntil(this.destroy$))
              .subscribe((has) => (this.hasNextOccurrence = has));
          }
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
        },
      });
  }

  loadAttendanceRecords(): void {
    this.attendanceService
      .getAttendanceRecords(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.attendanceRecords = records;
          // Re-enrich search results with updated status
          this.enrichSearchResults();
        },
        error: (error) => console.error('Error loading records:', error),
      });
  }

  private setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.membersService.searchMembers(query);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = this.enrichMembers(members);
          this.searching = false;
        },
        error: () => {
          this.searching = false;
        },
      });
  }

  private enrichMembers(members: Member[]): EnrichedMember[] {
    return members.map((m) => {
      const rec = this.attendanceRecords.find((r) => r.member_id === m.id);
      return {
        ...m,
        alreadyPresent: rec?.status === 'present',
        alreadyAbsent: rec?.status === 'absent',
        recordId: rec?.id,
      };
    });
  }

  private enrichSearchResults(): void {
    if (this.searchResults.length > 0) {
      this.searchResults = this.enrichMembers(this.searchResults);
    }
  }

  // ── Computed ──────────────────────────────────────────────────
  get presentRecords(): AttendanceRecord[] {
    return this.attendanceRecords.filter((r) => r.status === 'present');
  }

  get absentRecords(): AttendanceRecord[] {
    return this.attendanceRecords.filter((r) => r.status === 'absent');
  }

  checkInMember(member: EnrichedMember): void {
    if (this.isEventPast && !this.isEventToday) return;
    if (member.alreadyPresent) return;
    if (this.processingMemberIds.has(member.id)) return;

    this.processingMemberIds.add(member.id);
    this.errorMessage = '';

    this.attendanceService
      .checkInMember(this.eventId, member.id, 'manual')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingMemberIds.delete(member.id);
          this.successMessage = `${member.first_name} checked in!`;
          this.loadAttendanceRecords();
          this.loadEvent();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.processingMemberIds.delete(member.id);
          this.errorMessage = error.message || 'Failed to check in member';
        },
      });
  }

  // Replace markAbsentInline()
  markAbsentInline(member: EnrichedMember): void {
    if (this.isEventPast && !this.isEventToday) return;
    if (member.alreadyAbsent) return;

    this.absenceTargetMemberId = member.id;
    this.absenceTargetName = `${member.first_name} ${member.last_name}`;
    this.absenceTargetRecord = null;
    this.absenceReason = '';
    this.showAbsenceModal = true;
  }

  // ── Mark absent from existing present record ──────────────────
  openAbsenceModalForRecord(record: AttendanceRecord): void {
    this.absenceTargetRecord = record;
    this.absenceTargetMemberId = record.member_id || null;
    this.absenceTargetName = this.getAttendanceName(record);
    this.absenceReason = '';
    this.showAbsenceModal = true;
  }

  confirmMarkAbsent(): void {
    const memberId = this.absenceTargetMemberId;
    if (!memberId) return;

    this.markingAbsent = true;

    this.attendanceService
      .markMemberAbsent(this.eventId, memberId, this.absenceReason || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.markingAbsent = false;
          this.successMessage = `${this.absenceTargetName} marked absent.`;
          this.loadAttendanceRecords();
          this.loadEvent();
          this.closeAbsenceModal();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.markingAbsent = false;
          this.errorMessage = error.message || 'Failed to mark absent';
        },
      });
  }

  closeAbsenceModal(): void {
    this.showAbsenceModal = false;
    this.absenceTargetRecord = null;
    this.absenceTargetMemberId = null;
    this.absenceTargetName = '';
    this.absenceReason = '';
  }

  // ── Edit reason ───────────────────────────────────────────────
  openEditReasonModal(record: AttendanceRecord): void {
    this.editReasonRecord = record;
    this.editReasonText = record.absence_reason || '';
    this.showEditReasonModal = true;
  }

  confirmUpdateReason(): void {
    if (!this.editReasonRecord) return;
    this.updatingReason = true;

    this.attendanceService
      .updateAbsenceReason(this.editReasonRecord.id, this.editReasonText)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Reason updated.';
          this.loadAttendanceRecords();
          this.closeEditReasonModal();
          this.updatingReason = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.updatingReason = false;
          this.errorMessage = error.message || 'Failed to update reason';
        },
      });
  }

  closeEditReasonModal(): void {
    this.showEditReasonModal = false;
    this.editReasonRecord = null;
    this.editReasonText = '';
  }

  // ── Flip absent → present ──────────────────────────────────────
  markPresentFromAbsent(record: AttendanceRecord): void {
    if (!record.member_id || (this.isEventPast && !this.isEventToday)) return;
    if (this.processingRecordIds.has(record.id)) return;

    this.processingRecordIds.add(record.id);

    this.attendanceService
      .checkInMember(this.eventId, record.member_id, 'manual')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingRecordIds.delete(record.id);
          this.successMessage = 'Marked as present.';
          this.loadAttendanceRecords();
          this.loadEvent();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.processingRecordIds.delete(record.id);
          this.errorMessage = error.message || 'Failed to mark present';
        },
      });
  }

  isMemberProcessing(memberId: string): boolean {
    return this.processingMemberIds.has(memberId);
  }

  isRecordProcessing(recordId: string): boolean {
    return this.processingRecordIds.has(recordId);
  }

  // ── Visitor ───────────────────────────────────────────────────
  checkInVisitor(): void {
    if (!this.visitorName.trim()) {
      this.errorMessage = 'Visitor name is required';
      return;
    }
    const parts = this.visitorName.trim().split(/\s+/);
    if (parts.length < 2) {
      this.errorMessage = 'Please enter both first and last name';
      return;
    }

    this.addingVisitor = true;
    this.errorMessage = '';

    this.attendanceService
      .checkInVisitor(this.eventId, {
        first_name: parts[0],
        last_name: parts.slice(1).join(' '),
        phone: this.visitorPhone || undefined,
        email: this.visitorEmail || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Visitor checked in!';
          this.loadAttendanceRecords();
          this.loadEvent();
          this.toggleVisitorForm();
          this.addingVisitor = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.addingVisitor = false;
          this.errorMessage = error.message || 'Failed to check in visitor';
        },
      });
  }

  toggleVisitorForm(): void {
    this.showVisitorForm = !this.showVisitorForm;
    if (!this.showVisitorForm) {
      this.visitorName = '';
      this.visitorPhone = '';
      this.visitorEmail = '';
    }
  }

  // ── Bulk ──────────────────────────────────────────────────────
  toggleBulkMode(): void {
    this.bulkCheckInMode = !this.bulkCheckInMode;
    this.selectedMembers.clear();
  }

  bulkCheckIn(): void {
    if (this.selectedMembers.size === 0) {
      this.errorMessage = 'Select at least one member';
      return;
    }
    this.loading = true;

    this.attendanceService
      .bulkCheckIn(this.eventId, Array.from(this.selectedMembers))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.successMessage = `Checked in ${result.success} member(s)`;
          this.loadAttendanceRecords();
          this.loadEvent();
          this.toggleBulkMode();
          this.loading = false;
          setTimeout(() => (this.successMessage = ''), 5000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Bulk check-in failed';
        },
      });
  }

  removeAttendance(recordId: string): void {
    if (
      !this.permissionService.isAdmin &&
      !this.permissionService.attendance.manage
    ) {
      this.errorMessage = 'No permission to remove records';
      return;
    }
    if (!confirm('Remove this attendance record?')) return;

    this.attendanceService
      .removeAttendanceRecord(recordId, this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Record removed';
          this.loadAttendanceRecords();
          this.loadEvent();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove';
        },
      });
  }

  // ── Recurring: spawn next ─────────────────────────────────────
  spawnNextOccurrence(): void {
    if (!this.event || !this.event.is_recurring) return;
    this.spawningNext = true;

    this.attendanceService
      .spawnNextOccurrence(this.event)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newEvent) => {
          this.spawningNext = false;
          this.hasNextOccurrence = true;
          this.successMessage = 'Next occurrence created!';
          setTimeout(() => {
            this.successMessage = '';
            this.router.navigate(['main/attendance', newEvent.id]);
          }, 1500);
        },
        error: (error) => {
          this.spawningNext = false;
          this.errorMessage =
            error.message || 'Failed to create next occurrence';
        },
      });
  }

  private generateQRCode(): void {
    this.qrCodeData = this.attendanceService.generateQRCodeData(this.eventId);
  }

  toggleQRCode(): void {
    this.showQRCode = !this.showQRCode;
  }

  goBack(): void {
    this.router.navigate(['main/attendance', this.eventId]);
  }

  getMemberFullName(m: {
    first_name: string;
    middle_name?: string;
    last_name: string;
  }): string {
    return [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');
  }

  getMemberInitials(m: { first_name: string; last_name: string }): string {
    return `${m.first_name[0]}${m.last_name[0]}`.toUpperCase();
  }

  getAttendanceName(record: AttendanceRecord): string {
    if (record.member)
      return `${record.member.first_name} ${record.member.last_name}`;
    if (record.visitor)
      return `${record.visitor.first_name} ${record.visitor.last_name} (Visitor)`;
    return 'Unknown';
  }

  getCheckInTime(record: AttendanceRecord): string {
    return new Date(record.checked_in_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getFrequencyLabel(freq?: string): string {
    const map: Record<string, string> = {
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      monthly: 'Monthly',
    };
    return freq ? map[freq] || freq : '';
  }
}
