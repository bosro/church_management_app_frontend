// src/app/features/job-hub/components/job-hub-list/job-hub-list.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { JobPost, JobType } from '../../../../models/job.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { JobHubService } from '../../services/job-hub.services';

@Component({
  selector: 'app-job-hub-list',
  standalone: false,
  templateUrl: './job-hub-list.html',
  styleUrl: './job-hub-list.scss',
})
export class JobHubList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  jobs: JobPost[] = [];
  filteredJobs: JobPost[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  searchTerm = '';
  selectedType: JobType | '' = '';
  showAll = false;
  canManage = false;

  // Delete confirm modal
  showDeleteModal = false;
  jobToDelete: JobPost | null = null;
  deletingJob = false;

  readonly jobTypes: { value: JobType | ''; label: string }[] = [
    { value: '', label: 'All Types' },
    { value: 'full_time', label: 'Full Time' },
    { value: 'part_time', label: 'Part Time' },
    { value: 'contract', label: 'Contract' },
    { value: 'volunteer', label: 'Volunteer' },
    { value: 'internship', label: 'Internship' },
  ];

  constructor(
    private jobHubService: JobHubService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadJobs(): void {
    this.loading = true;
    this.jobHubService
      .getJobs(!this.showAll)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          this.jobs = data;
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  applyFilters(): void {
    let result = [...this.jobs];
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(term) ||
          (j.company_name || '').toLowerCase().includes(term) ||
          (j.location || '').toLowerCase().includes(term) ||
          j.description.toLowerCase().includes(term),
      );
    }
    if (this.selectedType)
      result = result.filter((j) => j.job_type === this.selectedType);
    this.filteredJobs = result;
  }

  viewJob(id: string): void {
    this.router.navigate(['/main/job-hub', id]);
  }
  createJob(): void {
    this.router.navigate(['/main/job-hub/manage']);
  }
  editJob(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.router.navigate(['/main/job-hub/manage', id]);
  }

  openDeleteModal(job: JobPost, event: MouseEvent): void {
    event.stopPropagation();
    this.jobToDelete = job;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.jobToDelete = null;
    this.showDeleteModal = false;
  }

  confirmDelete(): void {
    if (!this.jobToDelete) return;
    this.deletingJob = true;
    this.jobHubService
      .deleteJob(this.jobToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `"${this.jobToDelete!.title}" deleted successfully.`;
          this.deletingJob = false;
          this.closeDeleteModal();
          this.loadJobs();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.deletingJob = false;
        },
      });
  }

  toggleStatus(job: JobPost, event: MouseEvent): void {
    event.stopPropagation();
    this.jobHubService
      .toggleJobStatus(job.id, !job.is_active)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          job.is_active = !job.is_active;
          this.successMessage = `Job ${job.is_active ? 'activated' : 'deactivated'}!`;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
        },
      });
  }

  toggleShowAll(): void {
    this.showAll = !this.showAll;
    this.loadJobs();
  }

  getJobTypeLabel(type: JobType): string {
    const map: Record<string, string> = {
      full_time: 'Full Time',
      part_time: 'Part Time',
      contract: 'Contract',
      volunteer: 'Volunteer',
      internship: 'Internship',
    };
    return map[type] || type;
  }

  getJobTypeClass(type: JobType): string {
    const map: Record<string, string> = {
      full_time: 'type-full',
      part_time: 'type-part',
      contract: 'type-contract',
      volunteer: 'type-volunteer',
      internship: 'type-intern',
    };
    return map[type] || '';
  }

  getActiveCount(): number {
    return this.jobs.filter((j) => j.is_active && !j.is_expired).length;
  }
  getExpiredCount(): number {
    return this.jobs.filter((j) => j.is_expired).length;
  }
}
