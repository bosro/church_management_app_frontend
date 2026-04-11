// src/app/features/job-hub/components/job-hub-detail/job-hub-detail.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { JobPost } from '../../../../models/job.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { JobHubService } from '../../services/job-hub.services';

@Component({
  selector: 'app-job-hub-detail',
  standalone: false,
  templateUrl: './job-hub-detail.html',
  styleUrl: './job-hub-detail.scss',
})
export class JobHubDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  jobId = '';
  job: JobPost | null = null;
  loading = false;
  errorMessage = '';
  successMessage = '';
  canManage = false;

  // Delete confirm modal
  showDeleteModal = false;
  deletingJob = false;

  constructor(
    private jobHubService: JobHubService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    this.jobId = this.route.snapshot.paramMap.get('id') || '';
    if (this.jobId) this.loadJob();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadJob(): void {
    this.loading = true;
    this.jobHubService.getJobById(this.jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (job) => { this.job = job; this.loading = false; },
        error: (err) => { this.errorMessage = err.message; this.loading = false; },
      });
  }

  editJob(): void { this.router.navigate(['/main/job-hub/manage', this.jobId]); }

  openDeleteModal(): void { this.showDeleteModal = true; }
  closeDeleteModal(): void { this.showDeleteModal = false; }

  confirmDelete(): void {
    this.deletingJob = true;
    this.jobHubService.deleteJob(this.jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.router.navigate(['/main/job-hub']); },
        error: (err) => { this.errorMessage = err.message; this.deletingJob = false; },
      });
  }

  toggleStatus(): void {
    if (!this.job) return;
    this.jobHubService.toggleJobStatus(this.jobId, !this.job.is_active)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.job!.is_active = !this.job!.is_active;
          this.successMessage = `Job ${this.job!.is_active ? 'activated' : 'deactivated'}!`;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => { this.errorMessage = err.message; },
      });
  }

  getJobTypeLabel(type: string): string {
    const map: Record<string, string> = {
      full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract',
      volunteer: 'Volunteer', internship: 'Internship',
    };
    return map[type] || type;
  }

  applyJob(): void {
    if (!this.job) return;
    if (this.job.application_url) window.open(this.job.application_url, '_blank');
    else if (this.job.contact_email) {
      window.location.href = `mailto:${this.job.contact_email}?subject=Application for ${this.job.title}`;
    }
  }

  goBack(): void { this.router.navigate(['/main/job-hub']); }
}
