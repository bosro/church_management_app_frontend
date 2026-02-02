// src/app/features/branches/components/branch-detail/branch-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../../members/services/member.service';
import { Branch, BranchMember } from '../../../../models/branch.model';
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
  allMembers: any[] = [];
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
  filteredMembers: any[] = [];

  constructor(
    private branchesService: BranchesService,
    private memberService: MemberService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    if (this.branchId) {
      this.loadBranch();
      this.loadBranchMembers();
      this.loadAllMembers();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadBranch(): void {
    this.loadingBranch = true;

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
    this.memberService
      .getMembers({}, 1, 1000) // Pass empty filters object
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
    this.router.navigate(['/branches']);
  }

  editBranch(): void {
    this.router.navigate(['/branches', this.branchId, 'edit']);
  }

  // Member Assignment
  openAssignModal(): void {
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
        ? `${member.first_name} ${member.last_name}`
            .toLowerCase()
            .includes(this.searchTerm.toLowerCase())
        : true;
      const notAssigned = !assignedMemberIds.includes(member.id);
      return matchesSearch && notAssigned;
    });
  }

  assignMember(memberId: string): void {
    this.branchesService
      .assignMemberToBranch(this.branchId, memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member assigned successfully!';
          this.loadBranchMembers();
          this.closeAssignModal();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to assign member';
        },
      });
  }

  removeMember(branchMemberId: string, event: Event): void {
    event.stopPropagation();

    if (
      confirm('Are you sure you want to remove this member from the branch?')
    ) {
      this.branchesService
        .removeMemberFromBranch(branchMemberId, this.branchId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Member removed successfully!';
            this.loadBranchMembers();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to remove member';
          },
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBranchMembers();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBranchMembers();
    }
  }

  // Helper Methods
  getMemberName(branchMember: BranchMember): string {
    if (branchMember.member) {
      return `${branchMember.member.first_name} ${branchMember.member.last_name}`;
    }
    return 'N/A';
  }

  getMemberPhoto(branchMember: BranchMember): string {
    return branchMember.member?.photo_url || 'assets/images/default-avatar.png';
  }
}
