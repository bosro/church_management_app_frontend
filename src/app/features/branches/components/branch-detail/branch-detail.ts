// src/app/features/branches/components/branch-detail/branch-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../../members/services/member.service';
import {
  Branch,
  BranchMember,
  BranchInsights,
  BranchPastor,
} from '../../../../models/branch.model';
import { Member } from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { BranchesService } from '../../services/branches';

@Component({
  selector: 'app-branch-detail',
  standalone: false,
  templateUrl: './branch-detail.html',
  styleUrl: './branch-detail.scss',
})
export class BranchDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branchId: string = '';
  branch: Branch | null = null;
  branchMembers: BranchMember[] = [];
  branchInsights: BranchInsights | null = null;
  allMembers: Member[] = [];
  availablePastors: BranchPastor[] = [];

  loading = false;
  loadingBranch = true;
  loadingInsights = false;
  errorMessage = '';
  successMessage = '';

  // View Mode
  viewMode: 'table' | 'card' = 'table';
  activeTab: 'members' | 'insights' = 'members';

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalMembers = 0;
  totalPages = 0;

  // Modals
  showAssignModal = false;
  showAssignPastorModal = false;
  searchTerm = '';
  filteredMembers: Member[] = [];

  // Permissions
  canManageBranches = false;
  canAssignMembers = false;
  canViewInsights = false;

  loadingPastors = false;

  constructor(
    private branchesService: BranchesService,
    private membersService: MemberService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    if (this.branchId) {
      this.loadBranch();
      this.loadBranchMembers();
      this.loadAllMembers();

      if (this.canViewInsights) {
        this.loadBranchInsights();
      }
    } else {
      this.errorMessage = 'Invalid branch ID';
      this.loadingBranch = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageBranches =
      this.permissionService.isAdmin || this.permissionService.branches.manage;

    this.canAssignMembers =
      this.permissionService.isAdmin || this.permissionService.branches.assign;

    this.canViewInsights =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin']);

    const canView =
      this.permissionService.isAdmin || this.permissionService.branches.view;

    if (!canView) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadBranch(): void {
    this.loadingBranch = true;
    this.errorMessage = '';

    this.branchesService
      .getBranchById(this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (branch) => {
          this.branch = branch;
          this.loadingBranch = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load branch';
          this.loadingBranch = false;
          console.error('Load branch error:', error);
        },
      });
  }

  private loadBranchInsights(): void {
    this.loadingInsights = true;

    this.branchesService
      .getBranchInsights(this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (insights) => {
          this.branchInsights = insights;
          this.loadingInsights = false;
        },
        error: (error) => {
          console.error('Error loading insights:', error);
          this.loadingInsights = false;
        },
      });
  }

  switchTab(tab: 'members' | 'insights'): void {
    this.activeTab = tab;
  }

  openAssignPastorModal(): void {
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to assign pastors';
      return;
    }

    if (this.branch?.pastor_id) {
      this.errorMessage = 'This branch already has an assigned pastor';
      return;
    }

    this.showAssignPastorModal = true;
    this.loadAvailablePastors();
  }

  closeAssignPastorModal(): void {
    this.showAssignPastorModal = false;
  }

  private loadAvailablePastors(): void {
    this.loadingPastors = true;

    this.branchesService
      .getAvailablePastors()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pastors) => {
          this.availablePastors = pastors;
          this.loadingPastors = false;
        },
        error: (error) => {
          console.error('Error loading pastors:', error);
          this.errorMessage = 'Failed to load available leaders';
          this.loadingPastors = false;
        },
      });
  }

  assignPastor(pastorId: string, sendEmail: boolean = true): void {
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to assign pastors';
      return;
    }

    this.branchesService
      .assignBranchPastor({
        user_id: pastorId,
        branch_id: this.branchId,
        send_welcome_email: sendEmail,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = sendEmail
            ? 'Pastor assigned successfully! Welcome email sent.'
            : 'Pastor assigned successfully!';
          this.loadBranch();
          this.closeAssignPastorModal();

          setTimeout(() => {
            this.successMessage = '';
          }, 5000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to assign pastor';
          console.error('Assign pastor error:', error);
        },
      });
  }

  removePastor(): void {
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to remove pastors';
      return;
    }

    if (
      !confirm('Are you sure you want to remove the pastor from this branch?')
    ) {
      return;
    }

    this.branchesService
      .removeBranchPastor(this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Pastor removed successfully!';
          this.loadBranch();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove pastor';
          console.error('Remove pastor error:', error);
        },
      });
  }

  loadBranchMembers(): void {
    this.loading = true;

    this.branchesService
      .getBranchMembers(this.branchId, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.branchMembers = data;
          this.totalMembers = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading members:', error);
          this.loading = false;
        },
      });
  }

  private loadAllMembers(): void {
    this.membersService
      .getMembers({}, 1, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          this.allMembers = data;
          this.filteredMembers = data;
        },
        error: (error) => {
          console.error('Error loading all members:', error);
        },
      });
  }

  toggleView(mode: 'table' | 'card'): void {
    this.viewMode = mode;
  }

  goBack(): void {
    this.router.navigate(['main/branches']);
  }

  editBranch(): void {
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to edit branches';
      return;
    }
    this.router.navigate(['main/branches', this.branchId, 'edit']);
  }

  openAssignModal(): void {
    if (!this.canAssignMembers) {
      this.errorMessage = 'You do not have permission to assign members';
      return;
    }
    this.showAssignModal = true;
    this.searchTerm = '';
    this.filterMembers();
  }

  closeAssignModal(): void {
    this.showAssignModal = false;
    this.searchTerm = '';
  }

  filterMembers(): void {
    const assignedMemberIds = this.branchMembers.map((bm) => bm.member_id);

    this.filteredMembers = this.allMembers.filter((member) => {
      const matchesSearch = this.searchTerm
        ? `${member.first_name} ${member.last_name} ${member.email || ''}`
            .toLowerCase()
            .includes(this.searchTerm.toLowerCase())
        : true;
      const notAssigned = !assignedMemberIds.includes(member.id);
      return matchesSearch && notAssigned;
    });
  }

  assignMember(memberId: string): void {
    if (!this.canAssignMembers) {
      this.errorMessage = 'You do not have permission to assign members';
      return;
    }

    this.branchesService
      .assignMemberToBranch(this.branchId, memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member assigned successfully!';
          this.loadBranchMembers();
          this.loadBranch();

          if (this.canViewInsights && this.activeTab === 'insights') {
            this.loadBranchInsights();
          }

          this.closeAssignModal();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to assign member';
          console.error('Assign member error:', error);
        },
      });
  }

  removeMember(branchMemberId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }

    if (!this.canAssignMembers) {
      this.errorMessage = 'You do not have permission to remove members';
      return;
    }

    if (
      !confirm('Are you sure you want to remove this member from the branch?')
    ) {
      return;
    }

    this.branchesService
      .removeMemberFromBranch(branchMemberId, this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member removed successfully!';
          this.loadBranchMembers();
          this.loadBranch();

          if (this.canViewInsights && this.activeTab === 'insights') {
            this.loadBranchInsights();
          }

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove member';
          console.error('Remove member error:', error);
        },
      });
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBranchMembers();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBranchMembers();
      this.scrollToTop();
    }
  }

  getMemberName(branchMember: BranchMember): string {
    if (branchMember.member) {
      const parts = [
        branchMember.member.first_name,
        branchMember.member.middle_name,
        branchMember.member.last_name,
      ].filter(Boolean);
      return parts.join(' ');
    }
    return 'N/A';
  }

  getMemberPhoto(branchMember: BranchMember): string {
    return branchMember.member?.photo_url || 'assets/images/default-avatar.png';
  }

  formatPhoneNumber(phone?: string): string {
    if (!phone) return 'N/A';
    return phone;
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  getPastorInitials(pastor?: BranchPastor): string {
    if (!pastor) return '?';
    const names = pastor.full_name.split(' ');
    if (names.length >= 2) {
      return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
    }
    return pastor.full_name.charAt(0).toUpperCase();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
