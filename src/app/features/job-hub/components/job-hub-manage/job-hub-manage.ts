// src/app/features/job-hub/components/job-hub-manage/job-hub-manage.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PermissionService } from '../../../../core/services/permission.service';
import { JobType } from '../../../../models/job.model';
import { JobHubService } from '../../services/job-hub.services';

@Component({
  selector: 'app-job-hub-manage',
  standalone: false,
  templateUrl: './job-hub-manage.html',
  styleUrl: './job-hub-manage.scss',
})
export class JobHubManage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  jobId = '';
  isEdit = false;
  form!: FormGroup;
  loading = false;
  loadingData = false;
  errorMessage = '';
  successMessage = '';

  readonly jobTypes: { value: JobType; label: string }[] = [
    { value: 'full_time', label: 'Full Time' },
    { value: 'part_time', label: 'Part Time' },
    { value: 'contract', label: 'Contract' },
    { value: 'volunteer', label: 'Volunteer' },
    { value: 'internship', label: 'Internship' },
  ];

  constructor(
    private fb: FormBuilder,
    private jobHubService: JobHubService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    const canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    if (!canManage) {
      this.router.navigate(['/main/job-hub']);
      return;
    }

    this.initForm();
    this.jobId = this.route.snapshot.paramMap.get('id') || '';
    this.isEdit = !!this.jobId;

    if (this.isEdit) this.loadJob();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    // Default expiry: 30 days from now
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    this.form = this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150),
        ],
      ],
      description: ['', [Validators.required, Validators.minLength(10)]],
      company_name: ['', Validators.maxLength(100)],
      location: ['', Validators.maxLength(100)],
      job_type: ['full_time' as JobType, Validators.required],
      salary_range: ['', Validators.maxLength(100)],
      contact_name: ['', Validators.maxLength(100)],
      contact_email: ['', [Validators.email, Validators.maxLength(100)]],
      contact_phone: ['', Validators.maxLength(20)],
      application_url: ['', Validators.maxLength(500)],
      requirements: [''],
      benefits: [''],
      expires_at: [this.toDateLocal(expires)],
    });
  }

  private loadJob(): void {
    this.loadingData = true;
    this.jobHubService
      .getJobById(this.jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (job) => {
          this.form.patchValue({
            ...job,
            expires_at: job.expires_at
              ? this.toDateLocal(new Date(job.expires_at))
              : '',
          });
          this.loadingData = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loadingData = false;
        },
      });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    const value = this.form.value;
    const payload = {
      ...value,
      expires_at: value.expires_at
        ? new Date(value.expires_at).toISOString()
        : null,
      // Nullify empty optional fields
      company_name: value.company_name || null,
      location: value.location || null,
      salary_range: value.salary_range || null,
      contact_name: value.contact_name || null,
      contact_email: value.contact_email || null,
      contact_phone: value.contact_phone || null,
      application_url: value.application_url || null,
      requirements: value.requirements || null,
      benefits: value.benefits || null,
    };

    this.loading = true;
    this.errorMessage = '';

    const request = this.isEdit
      ? this.jobHubService.updateJob(this.jobId, payload)
      : this.jobHubService.createJob(payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (job) => {
        this.successMessage = this.isEdit
          ? 'Job updated!'
          : 'Job posted successfully!';
        this.loading = false;
        setTimeout(() => this.router.navigate(['/main/job-hub', job.id]), 1200);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to save job';
        this.loading = false;
      },
    });
  }

  cancel(): void {
    if (this.form.dirty && !confirm('Discard unsaved changes?')) return;
    this.router.navigate(
      this.isEdit ? ['/main/job-hub', this.jobId] : ['/main/job-hub'],
    );
  }

  getError(field: string): string {
    const c = this.form.get(field);
    if (!c || !c.errors || !c.touched) return '';
    if (c.hasError('required')) return 'This field is required';
    if (c.hasError('email')) return 'Invalid email address';
    if (c.hasError('minlength'))
      return `Minimum ${c.getError('minlength').requiredLength} characters`;
    if (c.hasError('maxlength'))
      return `Maximum ${c.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  private toDateLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
