// src/app/features/attendance/components/link-checkin/link-checkin.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AttendanceLinkService, AttendanceLink } from '../../services/attendance-link.service';
import { AttendanceService } from '../../services/attendance.service';
import { MemberService } from '../../../members/services/member.service';
import { AttendanceEvent } from '../../../../models/attendance.model';
import { Member } from '../../../../models/member.model';

type PageState =
  | 'loading'
  | 'invalid'
  | 'expired'
  | 'deactivated'
  | 'maxed'
  | 'search'
  | 'visitor-form'
  | 'checking-in'
  | 'success'
  | 'already-checked-in';

@Component({
  selector: 'app-link-checkin',
  standalone: false,
  templateUrl: './link-checkin.html',
  styleUrl: './link-checkin.scss',
})
export class LinkCheckin implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  token = '';
  link: AttendanceLink | null = null;
  event: AttendanceEvent | null = null;
  pageState: PageState = 'loading';
  invalidReason = '';

  // Member search
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;

  // Visitor form
  visitorFirstName = '';
  visitorLastName = '';
  visitorPhone = '';
  visitorEmail = '';
  visitorFormError = '';

  // Success
  checkedInMember: Member | null = null;
  checkedInVisitorName = '';
  checkInTime: Date = new Date();
  wasVisitor = false;

  constructor(
    private route: ActivatedRoute,
    private linkService: AttendanceLinkService,
    private attendanceService: AttendanceService,
    private memberService: MemberService,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.pageState = 'invalid';
      this.invalidReason = 'Invalid link';
      return;
    }
    this.validateLink();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private validateLink(): void {
    this.pageState = 'loading';

    this.linkService
      .validateToken(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (!result.valid) {
            this.link = result.link || null;
            this.invalidReason = result.reason || 'This link is not valid';
            if (result.reason?.includes('expired'))          this.pageState = 'expired';
            else if (result.reason?.includes('deactivated')) this.pageState = 'deactivated';
            else if (result.reason?.includes('maximum'))     this.pageState = 'maxed';
            else                                             this.pageState = 'invalid';
            return;
          }
          this.link = result.link!;
          this.loadEvent();
        },
        error: () => {
          this.pageState = 'invalid';
          this.invalidReason = 'Could not verify this link. Please try again.';
        },
      });
  }

  private loadEvent(): void {
    this.attendanceService
      .publicGetEvent(this.link!.attendance_event_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.pageState = 'search';
          this.setupSearch();
        },
        error: () => {
          this.pageState = 'invalid';
          this.invalidReason = 'Event not found or no longer available.';
        },
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
          return this.memberService.searchMembersPublic(
            this.event!.church_id,
            query,
            10,
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: () => {
          this.searching = false;
          this.searchResults = [];
        },
      });
  }

  // ── Member check-in ───────────────────────────────────────────
  checkIn(memberId: string): void {
    if (!this.link || !this.event) return;
    this.pageState = 'checking-in';

    this.attendanceService
      .publicQRCheckIn(this.event.id, memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.linkService
            .incrementUses(this.link!.id, this.link!.current_uses)
            .pipe(takeUntil(this.destroy$))
            .subscribe();

          this.memberService
            .getMemberByIdPublic(memberId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (member) => { this.checkedInMember = member; },
              error: () => {
                const found = this.searchResults.find((m) => m.id === memberId);
                if (found) this.checkedInMember = found;
              },
            });

          this.wasVisitor = false;
          this.checkInTime = new Date();
          this.pageState = 'success';
          setTimeout(() => this.reset(), 5000);
        },
        error: (err) => {
          if (err.message?.includes('already checked in')) {
            this.pageState = 'already-checked-in';
            setTimeout(() => this.reset(), 3000);
          } else {
            this.pageState = 'search';
          }
        },
      });
  }

  // ── Visitor flow ──────────────────────────────────────────────
  openVisitorForm(): void {
    this.visitorFirstName = '';
    this.visitorLastName = '';
    this.visitorPhone = '';
    this.visitorEmail = '';
    this.visitorFormError = '';
    this.pageState = 'visitor-form';
  }

  backToSearch(): void {
    this.pageState = 'search';
    this.visitorFormError = '';
  }

  checkInAsVisitor(): void {
    this.visitorFormError = '';

    if (!this.visitorFirstName.trim()) {
      this.visitorFormError = 'First name is required';
      return;
    }
    if (!this.visitorLastName.trim()) {
      this.visitorFormError = 'Last name is required';
      return;
    }

    if (!this.link || !this.event) return;
    this.pageState = 'checking-in';

    this.attendanceService
      .checkInVisitorPublic(this.event.id, {
        first_name: this.visitorFirstName.trim(),
        last_name: this.visitorLastName.trim(),
        phone: this.visitorPhone.trim() || undefined,
        email: this.visitorEmail.trim() || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.linkService
            .incrementUses(this.link!.id, this.link!.current_uses)
            .pipe(takeUntil(this.destroy$))
            .subscribe();

          this.wasVisitor = true;
          this.checkedInVisitorName = `${this.visitorFirstName} ${this.visitorLastName}`;
          this.checkInTime = new Date();
          this.pageState = 'success';
          setTimeout(() => this.reset(), 5000);
        },
        error: () => {
          this.pageState = 'visitor-form';
          this.visitorFormError = 'Check-in failed. Please try again.';
        },
      });
  }

  reset(): void {
    this.pageState = 'search';
    this.checkedInMember = null;
    this.checkedInVisitorName = '';
    this.wasVisitor = false;
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  getMemberFullName(member: Member): string {
    return [member.first_name, member.middle_name, member.last_name]
      .filter(Boolean)
      .join(' ');
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  formatEventDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatTime(timeStr?: string): string {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }
}
