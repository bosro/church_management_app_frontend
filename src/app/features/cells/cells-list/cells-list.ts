// src/app/features/cells/components/cells-list/cells-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PermissionService } from '../../../core/services/permission.service';
import { AuthService } from '../../../core/services/auth';
import { CellGroup } from '../../../models/member.model';
import { CellGroupsService } from '../services/cell-groups.service';
import { CellGroupCreateInput } from '../../../models/cell-group.model';

@Component({
  selector: 'app-cells-list',
  standalone: false,
  templateUrl: './cells-list.html',
  styleUrl: './cells-list.scss',
})
export class CellsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  cellGroups: CellGroup[] = [];
  leaders: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Modals
  showCreateModal = false;
  showEditModal = false;
  showMembersModal = false;
  showDeleteModal = false;

  selectedGroup: CellGroup | null = null;
  groupMembers: any[] = [];
  loadingMembers = false;
  groupToDelete: CellGroup | null = null;
  isDeleting = false;
  isSubmitting = false;

  cellForm!: FormGroup;

  currentUserId = '';

  meetingDays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  canManage = false;

  constructor(
    private cellGroupsService: CellGroupsService,
    private fb: FormBuilder,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getCurrentUserRole();
    this.currentUserId = this.authService.getUserId(); // ← ADD THIS LINE
    this.canManage =
      this.permissionService.isAdmin ||
      ['pastor', 'senior_pastor', 'associate_pastor'].includes(role);

    this.initForm();
    this.loadCellGroups();
    this.loadLeaders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.cellForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      description: ['', [Validators.maxLength(300)]],
      leader_id: [''],
      meeting_day: [''],
      meeting_time: [''],
      meeting_location: ['', [Validators.maxLength(150)]],
    });
  }

  canManageGroup(group: CellGroup): boolean {
    if (this.canManage) return true;
    return group.leader_id === this.currentUserId;
  }

  private loadCellGroups(): void {
    this.loading = true;
    this.cellGroupsService
      .getCellGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.cellGroups = groups;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load cell groups';
          this.loading = false;
        },
      });
  }

  private loadLeaders(): void {
    this.cellGroupsService
      .getCellLeaders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (l) => (this.leaders = l) });
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.cellForm.reset();
    this.errorMessage = '';
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    if (this.isSubmitting) return;
    this.showCreateModal = false;
    this.errorMessage = '';
    this.cellForm.reset();
  }

  createCellGroup(): void {
    if (this.cellForm.invalid) {
      this.markTouched();
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';

    this.cellGroupsService
      .createCellGroup(this.buildInput())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Cell group created successfully!';
          this.isSubmitting = false;
          this.closeCreateModal();
          this.loadCellGroups();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to create cell group';
          this.isSubmitting = false;
        },
      });
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  openEditModal(group: CellGroup): void {
    this.selectedGroup = group;
    this.errorMessage = '';
    this.cellForm.patchValue({
      name: group.name,
      description: group.description || '',
      leader_id: group.leader_id || '',
      meeting_day: group.meeting_day || '',
      meeting_time: group.meeting_time || '',
      meeting_location: group.meeting_location || '',
    });
    this.showEditModal = true;
  }

  closeEditModal(): void {
    if (this.isSubmitting) return;
    this.showEditModal = false;
    this.selectedGroup = null;
    this.errorMessage = '';
    this.cellForm.reset();
  }

  updateCellGroup(): void {
    if (!this.selectedGroup || this.cellForm.invalid) {
      this.markTouched();
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';

    this.cellGroupsService
      .updateCellGroup(this.selectedGroup.id, this.buildInput())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Cell group updated successfully!';
          this.isSubmitting = false;
          this.closeEditModal();
          this.loadCellGroups();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to update cell group';
          this.isSubmitting = false;
        },
      });
  }

  // ── Members ─────────────────────────────────────────────────────────────────

  openMembersModal(group: CellGroup): void {
    this.selectedGroup = group;
    this.showMembersModal = true;
    this.loadingMembers = true;
    this.groupMembers = [];

    this.cellGroupsService
      .getCellGroupMembers(group.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (m) => {
          this.groupMembers = m;
          this.loadingMembers = false;
        },
        error: () => {
          this.loadingMembers = false;
        },
      });
  }

  closeMembersModal(): void {
    this.showMembersModal = false;
    this.selectedGroup = null;
    this.groupMembers = [];
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  openDeleteModal(group: CellGroup): void {
    this.groupToDelete = group;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    if (this.isDeleting) return;
    this.showDeleteModal = false;
    this.groupToDelete = null;
  }

  confirmDelete(): void {
    if (!this.groupToDelete || this.isDeleting) return;
    this.isDeleting = true;

    this.cellGroupsService
      .deactivateCellGroup(this.groupToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `"${this.groupToDelete!.name}" has been deactivated.`;
          this.isDeleting = false;
          this.closeDeleteModal();
          this.loadCellGroups();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to deactivate cell group';
          this.isDeleting = false;
          this.closeDeleteModal();
        },
      });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buildInput(): CellGroupCreateInput {
    const v = this.cellForm.value;
    return {
      name: v.name,
      description: v.description || undefined,
      leader_id: v.leader_id || undefined,
      meeting_day: v.meeting_day || undefined,
      meeting_time: v.meeting_time || undefined,
      meeting_location: v.meeting_location || undefined,
    };
  }

  private markTouched(): void {
    Object.values(this.cellForm.controls).forEach((c) => c.markAsTouched());
  }

  getErrorMessage(field: string): string {
    const ctrl = this.cellForm.get(field);
    if (!ctrl?.errors || !ctrl.touched) return '';
    if (ctrl.hasError('required')) return 'This field is required';
    if (ctrl.hasError('minlength'))
      return `Minimum ${ctrl.getError('minlength').requiredLength} characters`;
    if (ctrl.hasError('maxlength'))
      return `Maximum ${ctrl.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  getMemberFullName(m: any): string {
    return `${m.first_name} ${m.last_name}`.trim();
  }

  getMemberInitials(m: any): string {
    return `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase();
  }

  getActiveCellGroups(): CellGroup[] {
    return this.cellGroups.filter((g) => g.is_active);
  }
  getInactiveCellGroups(): CellGroup[] {
    return this.cellGroups.filter((g) => !g.is_active);
  }

  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      cell_leader: 'Cell Leader',
      group_leader: 'Group Leader',
      pastor: 'Pastor',
      senior_pastor: 'Senior Pastor',
      associate_pastor: 'Associate Pastor',
      church_admin: 'Admin',
    };
    return map[role] || role.replace(/_/g, ' ');
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
