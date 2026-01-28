

// src/app/features/attendance/components/qr-checkin/qr-checkin.component.ts
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
  selector: 'app-qr-checkin',
  standalone: false,
  templateUrl: './qr-checkin.html',
  styleUrl: './qr-checkin.scss',
})
export class QrCheckin implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: AttendanceEvent | null = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Member search for manual check-in
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;

  // Check-in status
  checkedIn = false;
  checkedInMember: Member | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService,
    private memberService: MemberService
  ) {}

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') || '';
    if (this.eventId) {
      this.loadEvent();
      this.setupSearch();
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
          this.errorMessage = 'Event not found or you do not have access';
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
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
        }
      });
  }

  checkIn(memberId: string): void {
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.attendanceService.verifyQRCheckIn(this.eventId, memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (record) => {
          this.loading = false;
          this.checkedIn = true;
          this.successMessage = 'Successfully checked in!';

          // Load member details
          this.memberService.getMemberById(memberId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (member) => {
                this.checkedInMember = member;
              }
            });

          // Reset after 3 seconds
          setTimeout(() => {
            this.resetCheckIn();
          }, 3000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Check-in failed. You may have already checked in.';
        }
      });
  }

  resetCheckIn(): void {
    this.checkedIn = false;
    this.checkedInMember = null;
    this.successMessage = '';
    this.errorMessage = '';
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  getMemberFullName(member: Member): string {
    return `${member.first_name} ${member.middle_name || ''} ${member.last_name}`.trim();
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }
}
