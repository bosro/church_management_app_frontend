
// src/app/features/attendance/components/mark-attendance/mark-attendance.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { MemberService } from '../../../members/services/member.service';
import { AttendanceEvent } from '../../../../models/attendance.model';
import { Member } from '../../../../models/member.model';

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
  attendanceRecords: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Member search
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;

  // Visitor form
  showVisitorForm = false;
  visitorName = '';
  visitorPhone = '';
  visitorEmail = '';
  addingVisitor = false;

  // Selected members for bulk check-in
  selectedMembers: Set<string> = new Set();
  bulkCheckInMode = false;

  // QR Code
  qrCodeData: string = '';
  showQRCode = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService,
    private memberService: MemberService
  ) {}

  ngOnInit(): void {
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

  private loadEvent(): void {
    this.attendanceService.getAttendanceEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
        }
      });
  }

  private loadAttendanceRecords(): void {
    this.attendanceService.getAttendanceRecords(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.attendanceRecords = records;
        },
        error: (error) => {
          console.error('Error loading attendance records:', error);
        }
      });
  }

  private setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.memberService.searchMembers(query);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members.filter(m =>
            !this.attendanceRecords.some(r => r.member_id === m.id)
          );
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
        }
      });
  }

  checkInMember(memberId: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.attendanceService.checkInMember(this.eventId, memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member checked in successfully!';
          this.loadAttendanceRecords();
          this.loadEvent();
          this.searchControl.setValue('');
          this.searchResults = [];
          this.loading = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to check in member';
        }
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

  checkInVisitor(): void {
    if (!this.visitorName.trim()) {
      this.errorMessage = 'Visitor name is required';
      return;
    }

    this.addingVisitor = true;
    this.errorMessage = '';

    const [firstName, ...lastNameParts] = this.visitorName.trim().split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    this.attendanceService.checkInVisitor(this.eventId, {
      first_name: firstName,
      last_name: lastName,
      phone: this.visitorPhone || undefined,
      email: this.visitorEmail || undefined
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Visitor checked in successfully!';
          this.loadAttendanceRecords();
          this.loadEvent();
          this.toggleVisitorForm();
          this.addingVisitor = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.addingVisitor = false;
          this.errorMessage = error.message || 'Failed to check in visitor';
        }
      });
  }

  toggleBulkMode(): void {
    this.bulkCheckInMode = !this.bulkCheckInMode;
    this.selectedMembers.clear();
  }

  toggleMemberSelection(memberId: string): void {
    if (this.selectedMembers.has(memberId)) {
      this.selectedMembers.delete(memberId);
    } else {
      this.selectedMembers.add(memberId);
    }
  }

  bulkCheckIn(): void {
    if (this.selectedMembers.size === 0) {
      this.errorMessage = 'Please select at least one member';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const memberIds = Array.from(this.selectedMembers);

    this.attendanceService.bulkCheckIn(this.eventId, memberIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.successMessage = `Successfully checked in ${result.success} member${result.success > 1 ? 's' : ''}`;
          if (result.errors.length > 0) {
            this.errorMessage = `${result.errors.length} error${result.errors.length > 1 ? 's' : ''} occurred`;
          }
          this.loadAttendanceRecords();
          this.loadEvent();
          this.toggleBulkMode();
          this.loading = false;

          setTimeout(() => {
            this.successMessage = '';
            this.errorMessage = '';
          }, 5000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to check in members';
        }
      });
  }

  removeAttendance(recordId: string): void {
    if (!confirm('Are you sure you want to remove this attendance record?')) {
      return;
    }

    this.attendanceService.removeAttendanceRecord(recordId, this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Attendance record removed';
          this.loadAttendanceRecords();
          this.loadEvent();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove record';
        }
      });
  }

  private generateQRCode(): void {
    this.qrCodeData = this.attendanceService.generateQRCodeData(this.eventId);
  }

  toggleQRCode(): void {
    this.showQRCode = !this.showQRCode;
  }

  goBack(): void {
    this.router.navigate(['/attendance', this.eventId]);
  }

  getMemberFullName(member: any): string {
    if (!member) return 'Unknown';
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: any): string {
    if (!member) return '?';
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  getAttendanceName(record: any): string {
    if (record.member) {
      return `${record.member.first_name} ${record.member.last_name}`;
    }
    if (record.visitor) {
      return `${record.visitor.first_name} ${record.visitor.last_name} (Visitor)`;
    }
    return 'Unknown';
  }

  getCheckInTime(record: any): string {
    return new Date(record.checked_in_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
