// src/app/features/members/components/member-detail/member-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { Member } from '../../../../models/member.model';

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

  // Active tab
  activeTab: 'overview' | 'attendance' | 'giving' | 'ministries' = 'overview';

  // Permissions
  canEditMember = false;
  canDeleteMember = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private memberService: MemberService,
    private authService: AuthService
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
    const editRoles = ['super_admin', 'church_admin', 'pastor', 'group_leader'];
    const deleteRoles = ['super_admin', 'church_admin'];

    this.canEditMember = this.authService.hasRole(editRoles);
    this.canDeleteMember = this.authService.hasRole(deleteRoles);
  }

  private loadMember(memberId: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.memberService.getMemberById(memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          this.member = member;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load member details';
          this.loading = false;
        }
      });
  }

  goBack(): void {
    this.router.navigate(['main/members']);
  }

  editMember(): void {
    if (!this.canEditMember) {
      alert('You do not have permission to edit members');
      return;
    }

    if (this.member) {
      this.router.navigate(['main/members', this.member.id, 'edit']);
    }
  }

  deleteMember(): void {
    if (!this.canDeleteMember) {
      alert('You do not have permission to delete members');
      return;
    }

    if (!this.member) return;

    const confirmMessage = `Are you sure you want to deactivate ${this.getMemberFullName()}? This action can be reversed by reactivating the member later.`;

    if (confirm(confirmMessage)) {
      this.memberService.deleteMember(this.member.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.router.navigate(['main/members']);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete member';
          }
        });
    }
  }

  setActiveTab(tab: 'overview' | 'attendance' | 'giving' | 'ministries'): void {
    this.activeTab = tab;

    // TODO: Load tab-specific data
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

  private loadAttendanceData(): void {
    // TODO: Implement attendance data loading
    console.log('Loading attendance data...');
  }

  private loadGivingData(): void {
    // TODO: Implement giving data loading
    console.log('Loading giving data...');
  }

  private loadMinistriesData(): void {
    // TODO: Implement ministries data loading
    console.log('Loading ministries data...');
  }

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

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  getStatusClass(): string {
    if (!this.member) return '';

    const statusMap: Record<string, string> = {
      'active': 'status-active',
      'inactive': 'status-inactive',
      'transferred': 'status-transferred',
      'deceased': 'status-deceased'
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

    if (totalMonths < 1) {
      return 'Less than a month';
    } else if (totalMonths < 12) {
      return `${totalMonths} month${totalMonths > 1 ? 's' : ''}`;
    } else {
      const y = Math.floor(totalMonths / 12);
      const m = totalMonths % 12;
      if (m === 0) {
        return `${y} year${y > 1 ? 's' : ''}`;
      }
      return `${y} year${y > 1 ? 's' : ''}, ${m} month${m > 1 ? 's' : ''}`;
    }
  }

  formatPhoneNumber(phone: string | undefined): string {
    if (!phone) return '';

    // Format: 0201234567 -> 020 123 4567
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6)}`;
    }

    return phone;
  }
}
