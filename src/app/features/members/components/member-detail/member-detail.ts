
// src/app/features/members/components/member-detail/member-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private memberService: MemberService
  ) {}

  ngOnInit(): void {
    const memberId = this.route.snapshot.paramMap.get('id');
    if (memberId) {
      this.loadMember(memberId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMember(memberId: string): void {
    this.loading = true;

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
    if (this.member) {
      this.router.navigate(['main/members', this.member.id, 'edit']);
    }
  }

  deleteMember(): void {
    if (!this.member) return;

    if (confirm('Are you sure you want to deactivate this member?')) {
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

    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''}`;
    } else if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''}`;
    }
    return 'Less than a month';
  }
}
