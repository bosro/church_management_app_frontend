// src/app/features/members/components/member-detail/member-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { Member } from '../../../../models/member.model';
import {
  MemberAttendanceRecord,
  MemberAttendanceSummary,
  MemberGivingTransaction,
  MemberGivingSummary,
  MemberPledge,
  MemberMinistryAssignment,
} from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-member-detail',
  standalone: false,
  templateUrl: './member-detail.html',
  styleUrl: './member-detail.scss',
})
export class MemberDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  member: Member | null = null;
  loading = true;
  errorMessage = '';

  activeTab: 'overview' | 'attendance' | 'giving' | 'ministries' = 'overview';

  canEditMember = false;
  canDeleteMember = false;

  // ── Attendance state ────────────────────────────────────────────────────────
  attendanceSummary: MemberAttendanceSummary | null = null;
  attendanceRecords: MemberAttendanceRecord[] = [];
  loadingAttendance = false;
  attendancePage = 1;
  attendancePageSize = 15;
  attendanceTotalCount = 0;
  attendanceTotalPages = 0;
  attendanceLoaded = false;

  // ── Giving state ────────────────────────────────────────────────────────────
  givingSummary: MemberGivingSummary | null = null;
  givingTransactions: MemberGivingTransaction[] = [];
  memberPledges: MemberPledge[] = [];
  loadingGiving = false;
  givingPage = 1;
  givingPageSize = 15;
  givingTotalCount = 0;
  givingTotalPages = 0;
  givingLoaded = false;

  // ── Ministries state ────────────────────────────────────────────────────────
  ministryAssignments: MemberMinistryAssignment[] = [];
  loadingMinistries = false;
  ministriesLoaded = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private memberService: MemberService,
    private authService: AuthService,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    const memberId = this.route.snapshot.paramMap.get('id');
    if (memberId) {
      this.loadMember(memberId);
    } else {
      this.router.navigate(['main/members']);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canEditMember =
      this.permissionService.isAdmin || this.permissionService.members.edit;
    this.canDeleteMember =
      this.permissionService.isAdmin || this.permissionService.members.delete;
  }

  private loadMember(memberId: string): void {
    this.loading = true;
    this.errorMessage = '';
    this.memberService
      .getMemberById(memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          this.member = member;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load member details';
          this.loading = false;
        },
      });
  }

  goBack(): void {
    this.router.navigate(['main/members']);
  }

  editMember(): void {
    if (!this.canEditMember) {
      this.errorMessage = 'You do not have permission to edit members';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    if (this.member) {
      this.router.navigate(['main/members', this.member.id, 'edit']);
    }
  }

  deleteMember(): void {
    if (!this.canDeleteMember) {
      this.errorMessage = 'You do not have permission to delete members';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    if (!this.member) return;
    const confirmMessage = `Are you sure you want to deactivate ${this.getMemberFullName()}? This action can be reversed by reactivating the member later.`;
    if (confirm(confirmMessage)) {
      this.memberService
        .deleteMember(this.member.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.router.navigate(['main/members']),
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete member';
          },
        });
    }
  }

  setActiveTab(tab: 'overview' | 'attendance' | 'giving' | 'ministries'): void {
    this.activeTab = tab;
    switch (tab) {
      case 'attendance':
        this.loadAttendanceData();
        break;
      case 'giving':
        this.loadGivingData();
        break;
      case 'ministries':
        this.loadMinistriesData();
        break;
    }
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  private loadAttendanceData(page = 1): void {
    if (!this.member) return;
    this.loadingAttendance = true;
    this.attendancePage = page;

    this.memberService
      .getMemberAttendanceSummary(this.member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((summary) => (this.attendanceSummary = summary));

    this.memberService
      .getMemberAttendanceRecords(this.member.id, page, this.attendancePageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.attendanceRecords = data;
          this.attendanceTotalCount = count;
          this.attendanceTotalPages = Math.ceil(count / this.attendancePageSize);
          this.loadingAttendance = false;
          this.attendanceLoaded = true;
        },
        error: () => {
          this.loadingAttendance = false;
          this.attendanceLoaded = true;
        },
      });
  }

  attendancePreviousPage(): void {
    if (this.attendancePage > 1) this.loadAttendanceData(this.attendancePage - 1);
  }

  attendanceNextPage(): void {
    if (this.attendancePage < this.attendanceTotalPages)
      this.loadAttendanceData(this.attendancePage + 1);
  }

  // ── Giving ──────────────────────────────────────────────────────────────────

  private loadGivingData(page = 1): void {
    if (!this.member) return;
    this.loadingGiving = true;
    this.givingPage = page;

    this.memberService
      .getMemberGivingSummary(this.member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((summary) => (this.givingSummary = summary));

    this.memberService
      .getMemberPledges(this.member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((pledges) => (this.memberPledges = pledges));

    this.memberService
      .getMemberGivingTransactions(this.member.id, page, this.givingPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.givingTransactions = data;
          this.givingTotalCount = count;
          this.givingTotalPages = Math.ceil(count / this.givingPageSize);
          this.loadingGiving = false;
          this.givingLoaded = true;
        },
        error: () => {
          this.loadingGiving = false;
          this.givingLoaded = true;
        },
      });
  }

  givingPreviousPage(): void {
    if (this.givingPage > 1) this.loadGivingData(this.givingPage - 1);
  }

  givingNextPage(): void {
    if (this.givingPage < this.givingTotalPages)
      this.loadGivingData(this.givingPage + 1);
  }

  getPledgeProgress(pledge: MemberPledge): number {
    if (!pledge.pledge_amount) return 0;
    return Math.min(100, Math.round((pledge.amount_paid / pledge.pledge_amount) * 100));
  }

  // ── Ministries ──────────────────────────────────────────────────────────────

  private loadMinistriesData(): void {
    if (!this.member || this.ministriesLoaded) return;
    this.loadingMinistries = true;
    this.memberService
      .getMemberMinistries(this.member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (assignments) => {
          this.ministryAssignments = assignments;
          this.loadingMinistries = false;
          this.ministriesLoaded = true;
        },
        error: () => {
          this.loadingMinistries = false;
          this.ministriesLoaded = true;
        },
      });
  }

  getActiveMinistries(): MemberMinistryAssignment[] {
    return this.ministryAssignments.filter((m) => m.is_active);
  }

  getInactiveMinistries(): MemberMinistryAssignment[] {
    return this.ministryAssignments.filter((m) => !m.is_active);
  }

  // ── Existing helpers (unchanged) ────────────────────────────────────────────

  getMemberFullName(): string {
    if (!this.member) return '';
    return `${this.member.first_name} ${this.member.middle_name || ''} ${this.member.last_name}`.trim();
  }

  getMemberInitials(): string {
    if (!this.member) return '';
    return `${this.member.first_name[0]}${this.member.last_name[0]}`.toUpperCase();
  }

  calculateAge(): number | null {
    if (!this.member?.date_of_birth) return null;
    const today = new Date();
    const birthDate = new Date(this.member.date_of_birth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }

  getStatusClass(): string {
    if (!this.member) return '';
    const statusMap: Record<string, string> = {
      active: 'status-active',
      inactive: 'status-inactive',
      transferred: 'status-transferred',
      deceased: 'status-deceased',
    };
    return statusMap[this.member.membership_status] || '';
  }

  getMembershipDuration(): string {
    if (!this.member?.join_date) return '';
    const joinDate = new Date(this.member.join_date);
    const today = new Date();
    const years = today.getFullYear() - joinDate.getFullYear();
    const months = today.getMonth() - joinDate.getMonth();
    const totalMonths = years * 12 + months;
    if (totalMonths < 1) return 'Less than a month';
    if (totalMonths < 12) return `${totalMonths} month${totalMonths > 1 ? 's' : ''}`;
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    if (m === 0) return `${y} year${y > 1 ? 's' : ''}`;
    return `${y} year${y > 1 ? 's' : ''}, ${m} month${m > 1 ? 's' : ''}`;
  }

  formatPhoneNumber(phone: string | undefined): string {
    if (!phone) return '';
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6)}`;
    }
    return phone;
  }

  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  formatEventType(type: string): string {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatPaymentMethod(method: string): string {
    const map: Record<string, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      mobile_money: 'Mobile Money',
      cheque: 'Cheque',
      card: 'Card',
      online: 'Online',
    };
    return map[method] ?? method;
  }
}
