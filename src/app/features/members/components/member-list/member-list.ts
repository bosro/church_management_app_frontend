
// src/app/features/members/components/member-list/member-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { Member, MemberSearchFilters } from '../../../../models/member.model';

@Component({
    selector: 'app-member-list',
  standalone: false,
  templateUrl: './member-list.html',
  styleUrl: './member-list.scss',
})
export class MemberList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  members: Member[] = [];
  loading = false;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalMembers = 0;
  totalPages = 0;

  // Filters
  filterForm!: FormGroup;
  filters: MemberSearchFilters = {};

  // View mode
  viewMode: 'grid' | 'list' = 'list';

  // Statistics
  statistics: any = null;

  constructor(
    private memberService: MemberService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initFilterForm();
    this.loadMembers();
    this.loadStatistics();
    this.setupFilterListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      search: [''],
      gender: [''],
      status: [''],
      branch: [''],
      ministry: ['']
    });
  }

  private setupFilterListener(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(values => {
        this.filters = {
          search_term: values.search || undefined,
          gender_filter: values.gender || undefined,
          status_filter: values.status || undefined,
          branch_filter: values.branch || undefined,
          ministry_filter: values.ministry || undefined
        };
        this.currentPage = 1;
        this.loadMembers();
      });
  }

  loadMembers(): void {
    this.loading = true;

    this.memberService.getMembers(this.filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.members = data;
          this.totalMembers = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading members:', error);
          this.loading = false;
        }
      });
  }

  loadStatistics(): void {
    this.memberService.getMemberStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        }
      });
  }

  // Navigation
  viewMember(memberId: string): void {
    this.router.navigate(['main/members', memberId]);
  }

  addMember(): void {
    this.router.navigate(['main/members/add']);
  }

  editMember(memberId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/members', memberId, 'edit']);
  }

  importMembers(): void {
    this.router.navigate(['main/members/import']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMembers();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadMembers();
    }
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.loadMembers();
  }

  // Export
  exportMembers(): void {
    this.memberService.exportMembersToCSV(this.filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `members_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Error exporting members:', error);
        }
      });
  }

  // Delete member
  deleteMember(memberId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to deactivate this member?')) {
      this.memberService.deleteMember(memberId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadMembers();
          },
          error: (error) => {
            console.error('Error deleting member:', error);
          }
        });
    }
  }

  // View toggle
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
  }

  // Clear filters
  clearFilters(): void {
    this.filterForm.reset();
    this.filters = {};
    this.currentPage = 1;
    this.loadMembers();
  }

  // Helper methods
  getMemberFullName(member: Member): string {
    return `${member.first_name} ${member.middle_name || ''} ${member.last_name}`.trim();
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  getStatusClass(status: string): string {
    const statusMap: Record<string, string> = {
      'active': 'status-active',
      'inactive': 'status-inactive',
      'transferred': 'status-transferred',
      'deceased': 'status-deceased'
    };
    return statusMap[status] || '';
  }

  calculateAge(dateOfBirth: string | undefined): number | null {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
}
