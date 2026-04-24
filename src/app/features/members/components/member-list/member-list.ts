// src/app/features/members/components/member-list/member-list.component.ts
// CHANGES vs original:
// 1. deleteMember() → opens modal instead of confirm()
// 2. Added bulk-selection state + bulkDelete()
// 3. Added deleteDuplicates() with its own modal
// 4. All destructive actions go through ConfirmModal
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

  // Cell leader
  isCellLeader = false;
  currentUserId = '';
  cellLeaderGroupId: string | null = null;

  sortOrder: 'created_at_desc' | 'name_asc' | 'name_desc' = 'created_at_desc';

  allCellGroups: { id: string; name: string }[] = [];
  selectedCellGroupFilter = '';

  // ── Bulk selection ────────────────────────────────────────────────────────
  selectedIds = new Set<string>();
  selectAll = false;

  // ── Confirm modal state ───────────────────────────────────────────────────
  showConfirmModal = false;
  confirmModalConfig = {
    title: '',
    message: '',
    submessage: '',
    warningText: '',
    confirmLabel: '',
    variant: 'danger' as 'danger' | 'warning' | 'info',
    icon: '',
    loading: false,
  };
  private _pendingAction: (() => void) | null = null;

  // ── Duplicate stats ───────────────────────────────────────────────────────
  duplicateStats: { groups: number; toDelete: number } | null = null;
  loadingDuplicateStats = false;
  deletingDuplicates = false;

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

    const role = this.authService.getCurrentUserRole();
    this.isCellLeader = role === 'cell_leader';
    this.currentUserId = this.authService.getUserId();

    if (this.isCellLeader) {
      this.memberService
        .getCellGroups()
        .pipe(takeUntil(this.destroy$))
        .subscribe((groups) => {
          const myGroup = groups.find((g) => g.leader_id === this.currentUserId);
          if (myGroup) this.cellLeaderGroupId = myGroup.id;
        });
    }

    if (!this.isCellLeader) {
      this.memberService
        .getCellGroups()
        .pipe(takeUntil(this.destroy$))
        .subscribe((groups) => {
          this.allCellGroups = groups;
        });
    }

    this.initFilterForm();

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['filter'] === 'birthdays') {
        this.filterByUpcomingBirthdays();
      } else {
        this.loadMembers();
      }
    });

    this.loadStatistics();
    this.setupFilterListener();

    const savedViewMode = localStorage.getItem('members-view-mode');
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
      this.viewMode = savedViewMode;
    }

    // Load duplicate stats for admins/pastors
    if (this.canDeleteMember) {
      this.loadDuplicateStats();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isMyCell(member: Member): boolean {
    if (!this.isCellLeader) return true;
    return member.cell_group_id === this.cellLeaderGroupId;
  }

  filterMyCellMembers(): void {
    this.filterForm.reset(
      { search: '', gender: '', status: '', branch: '', ministry: '' },
      { emitEvent: false },
    );
    this.filters = {
      cell_group_filter: this.cellLeaderGroupId || undefined,
      sort_by: this.sortOrder,
    };
    this.currentPage = 1;
    this.loadMembers();
  }

  setSortOrder(order: 'created_at_desc' | 'name_asc' | 'name_desc'): void {
    this.sortOrder = order;
    this.filters = { ...this.filters, sort_by: order };
    this.currentPage = 1;
    this.loadMembers();
  }

  // ── Bulk selection ──────────────────────────────────────────────────────────

  toggleSelectAll(): void {
    this.selectAll = !this.selectAll;
    if (this.selectAll) {
      this.members.forEach((m) => this.selectedIds.add(m.id));
    } else {
      this.selectedIds.clear();
    }
  }

  toggleSelect(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.selectAll = this.selectedIds.size === this.members.length;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.selectAll = false;
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  // ── Confirm modal helpers ───────────────────────────────────────────────────

  private openConfirm(
    config: Partial<typeof this.confirmModalConfig>,
    action: () => void
  ): void {
    this.confirmModalConfig = {
      title: config.title || 'Are you sure?',
      message: config.message || '',
      submessage: config.submessage || '',
      warningText: config.warningText || '',
      confirmLabel: config.confirmLabel || 'Delete',
      variant: config.variant || 'danger',
      icon: config.icon || '',
      loading: false,
    };
    this._pendingAction = action;
    this.showConfirmModal = true;
  }

  onModalConfirmed(): void {
    if (this._pendingAction) {
      this._pendingAction();
    }
  }

  onModalCancelled(): void {
    if (!this.confirmModalConfig.loading) {
      this.showConfirmModal = false;
      this._pendingAction = null;
    }
  }

  // ── Single delete ───────────────────────────────────────────────────────────

  deleteMember(memberId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canDeleteMember) {
      this.error = 'You do not have permission to delete members';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }

    const member = this.members.find((m) => m.id === memberId);
    const name = member ? this.getMemberFullName(member) : 'this member';

    this.openConfirm(
      {
        title: 'Delete Member',
        message: `You are about to permanently delete ${name}.`,
        submessage: 'This will remove all their attendance, giving, and ministry records.',
        warningText: 'This action cannot be undone. The member will be removed from the system entirely.',
        confirmLabel: 'Yes, Delete Permanently',
        variant: 'danger',
        icon: 'ri-delete-bin-line',
      },
      () => this._doDeleteMember(memberId)
    );
  }

  private _doDeleteMember(memberId: string): void {
    this.confirmModalConfig.loading = true;

    this.memberService
      .hardDeleteMember(memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showConfirmModal = false;
          this.confirmModalConfig.loading = false;
          this.selectedIds.delete(memberId);
          this.loadMembers();
          this.loadStatistics();
          this.loadDuplicateStats();
        },
        error: (err) => {
          this.confirmModalConfig.loading = false;
          this.showConfirmModal = false;
          this.error = 'Failed to delete member: ' + (err.message || 'Unknown error');
        },
      });
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────

  bulkDelete(): void {
    if (!this.canDeleteMember || this.selectedIds.size === 0) return;

    const count = this.selectedIds.size;

    this.openConfirm(
      {
        title: `Delete ${count} Member${count > 1 ? 's' : ''}`,
        message: `You are about to permanently delete ${count} selected member${count > 1 ? 's' : ''}.`,
        submessage: 'All their attendance, giving, and ministry records will also be removed.',
        warningText: 'This action cannot be undone. These members will be removed from the system entirely.',
        confirmLabel: `Delete ${count} Member${count > 1 ? 's' : ''}`,
        variant: 'danger',
        icon: 'ri-delete-bin-line',
      },
      () => this._doBulkDelete()
    );
  }

  private _doBulkDelete(): void {
    this.confirmModalConfig.loading = true;
    const ids = Array.from(this.selectedIds);

    this.memberService
      .bulkHardDeleteMembers(ids)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.showConfirmModal = false;
          this.confirmModalConfig.loading = false;
          this.clearSelection();
          this.loadMembers();
          this.loadStatistics();
          this.loadDuplicateStats();
          if (result.errors.length > 0) {
            this.error = `Deleted ${result.deleted} members. ${result.errors.length} failed.`;
          }
        },
        error: (err) => {
          this.confirmModalConfig.loading = false;
          this.showConfirmModal = false;
          this.error = 'Bulk delete failed: ' + (err.message || 'Unknown error');
        },
      });
  }

  // ── Deduplicate ─────────────────────────────────────────────────────────────

  loadDuplicateStats(): void {
    this.loadingDuplicateStats = true;
    this.memberService
      .getDuplicateStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.duplicateStats = stats;
          this.loadingDuplicateStats = false;
        },
        error: () => {
          this.loadingDuplicateStats = false;
        },
      });
  }

  openDeleteDuplicatesModal(): void {
    if (!this.duplicateStats || this.duplicateStats.toDelete === 0) return;

    const { groups, toDelete } = this.duplicateStats;

    this.openConfirm(
      {
        title: 'Remove Duplicate Members',
        message: `Found ${toDelete} duplicate record${toDelete > 1 ? 's' : ''} across ${groups} group${groups > 1 ? 's' : ''}.`,
        submessage:
          'The oldest record in each group will be kept. All newer duplicates and their related data will be permanently deleted.',
        warningText: 'This cannot be undone. Make sure you have reviewed the duplicates before proceeding.',
        confirmLabel: `Delete ${toDelete} Duplicate${toDelete > 1 ? 's' : ''}`,
        variant: 'warning',
        icon: 'ri-user-unfollow-line',
      },
      () => this._doDeleteDuplicates()
    );
  }

  private _doDeleteDuplicates(): void {
    this.confirmModalConfig.loading = true;

    this.memberService
      .deleteDuplicateMembers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.showConfirmModal = false;
          this.confirmModalConfig.loading = false;
          this.duplicateStats = { groups: 0, toDelete: 0 };
          this.loadMembers();
          this.loadStatistics();
          // Show success briefly
          this.error = ''; // clear any errors
          const msg = `Successfully removed ${result.deleted} duplicate record${result.deleted > 1 ? 's' : ''} across ${result.groups} group${result.groups > 1 ? 's' : ''}.`;
          // Temporarily use error field as info (or add a success field)
          this._showSuccess(msg);
        },
        error: (err) => {
          this.confirmModalConfig.loading = false;
          this.showConfirmModal = false;
          this.error = 'Failed to remove duplicates: ' + (err.message || 'Unknown error');
        },
      });
  }

  // Reuse for success toast
  successMessage = '';
  private _showSuccess(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 5000);
  }

  // ── Existing methods (unchanged) ────────────────────────────────────────────

  private setPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const createRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'group_leader', 'cell_leader'];
    const editRoles = ['pastor', 'senior_pastor', 'associate_pastor'];
    const importExportRoles = ['pastor', 'senior_pastor', 'associate_pastor'];

    this.canAddMember =
      this.permissionService.isAdmin ||
      this.permissionService.members.create ||
      createRoles.includes(role);

    this.canEditMember =
      this.permissionService.isAdmin ||
      this.permissionService.members.edit ||
      editRoles.includes(role);

    this.canDeleteMember =
      this.permissionService.isAdmin || this.permissionService.members.delete;

    this.canImportExport =
      this.permissionService.isAdmin ||
      this.permissionService.members.export ||
      this.permissionService.members.import ||
      importExportRoles.includes(role);
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      search: [''],
      gender: [''],
      status: [''],
      branch: [''],
      ministry: [''],
      cell_group: [''],
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
          cell_group_filter: values.cell_group || undefined,
          sort_by: this.sortOrder,
        };
        this.currentPage = 1;
        this.clearSelection();
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
          this.filteredMemberCount = members.length;
          this.showBirthdayNotice = true;
        },
        error: (error) => {
          this.error = error.message || 'Failed to load members with upcoming birthdays';
          this.loading = false;
        },
      });
  }

  loadMembers(): void {
    this.loading = true;
    this.error = '';
    this.showBirthdayNotice = false;

    this.memberService
      .getMembers(this.filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.members = data;
          this.totalMembers = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
          // Re-sync selectAll state
          if (this.selectedIds.size > 0) {
            this.selectAll = this.members.every((m) => this.selectedIds.has(m.id));
          }
        },
        error: (error) => {
          this.error = error.message || 'Failed to load members';
          this.loading = false;
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
        },
        error: () => {
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
    if (!this.canImportExport) return;
    this.router.navigate(['main/members/import']);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMembers();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadMembers();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadMembers();
    }
  }

  exportMembers(): void {
    if (!this.canImportExport) return;
    this.showExportModal = true;
  }

  exportAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showExportModal = false;
    const today = new Date().toISOString().split('T')[0];
    const fileName = `members_export_${today}`;
    const ext = format === 'excel' ? 'xlsx' : format;

    const export$ =
      format === 'excel'
        ? this.memberService.exportMembersToExcel(this.filters)
        : format === 'pdf'
          ? this.memberService.exportMembersToPDF(this.filters)
          : this.memberService.exportMembersToCSV(this.filters);

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
        this.error = 'Failed to export: ' + (err.message || 'Unknown error');
      },
    });
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('members-view-mode', this.viewMode);
    this.clearSelection();
  }

  clearFilters(): void {
    this.sortOrder = 'created_at_desc';
    this.filterForm.reset({ search: '', gender: '', status: '', branch: '', ministry: '', cell_group: '' });
    this.filters = {};
    this.currentPage = 1;
  }

  closeBirthdayNotice(): void {
    this.showBirthdayNotice = false;
    this.router.navigate(['main/members']);
  }

  navigateToRegistrationLinks(): void {
    if (!this.canImportExport) return;
    this.router.navigate(['main/members/registration-links']);
  }

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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }
}


