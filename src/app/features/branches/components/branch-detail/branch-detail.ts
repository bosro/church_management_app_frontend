// src/app/features/branches/components/branch-detail/branch-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BranchesService } from '../../services/branches';
import { MemberService } from '../../../members/services/member.service';
import { Branch, BranchMember } from '../../../../models/branch.model';
import { Member } from '../../../../models/member.model';

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
  allMembers: Member[] = [];
  loading = false;
  loadingBranch = true;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalMembers = 0;
  totalPages = 0;

  // Assignment Modal
  showAssignModal = false;
  searchTerm = '';
  filteredMembers: Member[] = [];

  // Permissions
  canManageBranches = false;
  canAssignMembers = false;

  constructor(
    private branchesService: BranchesService,
    private membersService: MemberService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    if (this.branchId) {
      this.loadBranch();
      this.loadBranchMembers();
      this.loadAllMembers();
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
    this.canManageBranches = this.branchesService.canManageBranches();
    this.canAssignMembers = this.branchesService.canAssignMembers();

    if (!this.branchesService.canViewBranches()) {
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

  // Navigation
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

  // Member Assignment
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
          this.loadBranch(); // Reload to update member count
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

  removeMember(branchMemberId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canAssignMembers) {
      this.errorMessage = 'You do not have permission to remove members';
      return;
    }

    if (!confirm('Are you sure you want to remove this member from the branch?')) {
      return;
    }

    this.branchesService
      .removeMemberFromBranch(branchMemberId, this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member removed successfully!';
          this.loadBranchMembers();
          this.loadBranch(); // Reload to update member count

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

  // Pagination
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

  // Helper Methods
  getMemberName(branchMember: BranchMember): string {
    if (branchMember.member) {
      const parts = [
        branchMember.member.first_name,
        branchMember.member.middle_name,
        branchMember.member.last_name
      ].filter(Boolean);
      return parts.join(' ');
    }
    return 'N/A';
  }

  getMemberPhoto(branchMember: BranchMember): string {
    return branchMember.member?.photo_url || 'assets/images/default-avatar.png';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
