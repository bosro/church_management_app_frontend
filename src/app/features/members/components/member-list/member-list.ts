// src/app/features/members/components/member-list/member-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import {
  Member,
  MemberSearchFilters,
  MemberStatistics,
} from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';

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
  error = '';

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
  statistics: MemberStatistics | null = null;
  loadingStats = false;

  // Permissions
  canAddMember = false;
  canEditMember = false;
  canDeleteMember = false;
  canImportExport = false;

  // Birthday notice
  showBirthdayNotice = false;
  filteredMemberCount = 0;

  showExportModal = false;
exporting = false;


  constructor(
    private memberService: MemberService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.setPermissions();
    this.initFilterForm();

    // Check for birthday filter from query params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['filter'] === 'birthdays') {
          this.filterByUpcomingBirthdays();
        } else {
          this.loadMembers();
        }
      });

    this.loadStatistics();
    this.setupFilterListener();

    // Load view mode from localStorage
    const savedViewMode = localStorage.getItem('members-view-mode');
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
      this.viewMode = savedViewMode;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setPermissions(): void {
    this.canAddMember =
      this.permissionService.isAdmin || this.permissionService.members.create;

    this.canEditMember =
      this.permissionService.isAdmin || this.permissionService.members.edit;

    this.canDeleteMember =
      this.permissionService.isAdmin || this.permissionService.members.delete;

    this.canImportExport =
      this.permissionService.isAdmin ||
      this.permissionService.members.export ||
      this.permissionService.members.import;
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      search: [''],
      gender: [''],
      status: [''],
      branch: [''],
      ministry: [''],
    });
  }

  private setupFilterListener(): void {
    this.filterForm.valueChanges
      .pipe(debounceTime(500), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((values) => {
        this.filters = {
          search_term: values.search || undefined,
          gender_filter: values.gender || undefined,
          status_filter: values.status || undefined,
          branch_filter: values.branch || undefined,
          ministry_filter: values.ministry || undefined,
        };
        this.currentPage = 1;
        this.loadMembers();
      });
  }

  private filterByUpcomingBirthdays(): void {
    this.loading = true;
    this.error = '';

    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    this.memberService
      .getMembersByBirthdayRange(
        today.toISOString().split('T')[0],
        thirtyDaysLater.toISOString().split('T')[0],
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (members) => {
          this.members = members;
          this.totalMembers = members.length;
          this.totalPages = 1;
          this.loading = false;

          // ✅ FIXED: Update birthday notice count and show it
          this.filteredMemberCount = members.length;
          this.showBirthdayNotice = true;
          // ✅ REMOVED: The error message that was creating the unstyled notice
        },
        error: (error) => {
          this.error =
            error.message || 'Failed to load members with upcoming birthdays';
          this.loading = false;
          console.error('Error loading birthday members:', error);
        },
      });
  }

  loadMembers(): void {
    this.loading = true;
    this.error = '';
    this.showBirthdayNotice = false; // ✅ Hide birthday notice when loading regular members

    this.memberService
      .getMembers(this.filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.members = data;
          this.totalMembers = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'Failed to load members';
          this.loading = false;
          console.error('Error loading members:', error);
        },
      });
  }

  loadStatistics(): void {
    this.loadingStats = true;

    this.memberService
      .getMemberStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loadingStats = false;
          // console.log('Statistics loaded:', stats);
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
          this.loadingStats = false;
          this.statistics = {
            total_members: 0,
            active_members: 0,
            inactive_members: 0,
            new_members_this_month: 0,
            new_members_this_year: 0,
            male_members: 0,
            female_members: 0,
          };
        },
      });
  }

  // Navigation
  viewMember(memberId: string): void {
    this.router.navigate(['main/members', memberId]);
  }

  addMember(): void {
    if (!this.canAddMember) {
      this.error = 'You do not have permission to add members';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }
    this.router.navigate(['main/members/add']);
  }

  editMember(memberId: string, event: Event): void {
    event.stopPropagation();
    if (!this.canEditMember) {
      this.error = 'You do not have permission to edit members';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }
    this.router.navigate(['main/members', memberId, 'edit']);
  }

  importMembers(): void {
    if (!this.canImportExport) {
      this.error = 'You do not have permission to import members';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }
    this.router.navigate(['main/members/import']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMembers();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadMembers();
      this.scrollToTop();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadMembers();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Export
  exportMembers(): void {
  if (!this.canImportExport) {
    this.error = 'You do not have permission to export members';
    setTimeout(() => (this.error = ''), 3000);
    return;
  }
  this.showExportModal = true;
}

exportAs(format: 'csv' | 'excel' | 'pdf'): void {
  this.exporting = true;
  this.showExportModal = false;

  const today = new Date().toISOString().split('T')[0];
  const fileName = `members_export_${today}`;
  const ext = format === 'excel' ? 'xlsx' : format;

  const export$ =
    format === 'excel' ? this.memberService.exportMembersToExcel(this.filters) :
    format === 'pdf'   ? this.memberService.exportMembersToPDF(this.filters) :
                         this.memberService.exportMembersToCSV(this.filters);

  export$.pipe(takeUntil(this.destroy$)).subscribe({
    next: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      this.exporting = false;
    },
    error: (err) => {
      this.exporting = false;
      this.error = 'Failed to export members: ' + (err.message || 'Unknown error');
    },
  });
}

  // Delete member
  deleteMember(memberId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canDeleteMember) {
      this.error = 'You do not have permission to delete members';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }

    if (
      confirm(
        'Are you sure you want to deactivate this member? This action can be reversed by reactivating the member later.',
      )
    ) {
      this.memberService
        .deleteMember(memberId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadMembers();
            this.loadStatistics();
          },
          error: (error) => {
            this.error =
              'Failed to delete member: ' + (error.message || 'Unknown error');
            console.error('Error deleting member:', error);
          },
        });
    }
  }

  // View toggle
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('members-view-mode', this.viewMode);
  }

  // Clear filters
  clearFilters(): void {
    this.filterForm.reset({
      search: '',
      gender: '',
      status: '',
      branch: '',
      ministry: '',
    });
    this.filters = {};
    this.currentPage = 1;
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
      active: 'status-active',
      inactive: 'status-inactive',
      transferred: 'status-transferred',
      deceased: 'status-deceased',
    };
    return statusMap[status] || '';
  }

  calculateAge(dateOfBirth: string | undefined): number | null {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  }

  navigateToRegistrationLinks(): void {
    if (!this.canImportExport) {
      this.error = 'You do not have permission to manage registration links';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }
    this.router.navigate(['main/members/registration-links']);
  }

  // ✅ FIXED: Close birthday notice
  closeBirthdayNotice(): void {
    this.showBirthdayNotice = false;
    // Optionally navigate back to all members
    this.router.navigate(['main/members']);
  }
}





