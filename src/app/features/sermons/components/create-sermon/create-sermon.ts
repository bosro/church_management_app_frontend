// src/app/features/sermons/components/create-sermon/create-sermon.component.ts
// KEY FIXES:
// 1. Added checkPermissions() — was completely missing, any URL visitor could
//    access the create form directly
// 2. Added PermissionService and AuthService injection
// 3. Fixed navigation: '/sermon' → 'main/sermons' (correct prefix + plural)
// 4. Fixed loading state: loading now resets to false on success
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SermonsService } from '../../services/sermons';
import { SermonSeries } from '../../../../models/sermon.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-create-sermon',
  standalone: false,
  templateUrl: './create-sermon.html',
  styleUrl: './create-sermon.scss',
})
export class CreateSermon implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sermonForm!: FormGroup;
  sermonSeries: SermonSeries[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private sermonsService: SermonsService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadSermonSeries();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const uploadRoles = [
      'pastor', 'senior_pastor', 'associate_pastor', 'worship_leader',
    ];

    const canUpload =
      this.permissionService.isAdmin ||
      this.permissionService.sermons.upload ||
      uploadRoles.includes(role);

    if (!canUpload) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.sermonForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      preacher_name: ['', [Validators.required]],
      sermon_date: ['', [Validators.required]],
      series_name: [''],
      scripture_reference: [''],
      audio_url: [''],
      video_url: [''],
      notes_url: [''],
      thumbnail_url: [''],
      duration: [null],
      tags: [''],
    });
  }

  private loadSermonSeries(): void {
    this.sermonsService
      .getSermonSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => { this.sermonSeries = series; },
        error: (error) => { console.error('Error loading series:', error); },
      });
  }

  onSubmit(): void {
    if (this.sermonForm.invalid) {
      this.markFormGroupTouched(this.sermonForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const formData = {
      ...this.sermonForm.value,
      tags: this.sermonForm.value.tags
        ? this.sermonForm.value.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t)
        : [],
    };

    this.sermonsService
      .createSermon(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Sermon uploaded successfully!';
          // FIX: reset loading on success (was never reset before)
          this.loading = false;
          setTimeout(() => {
            // FIX: correct path — 'main/sermons' (plural, with main/ prefix)
            this.router.navigate(['main/sermons']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to upload sermon. Please try again.';
        },
      });
  }

  cancel(): void {
    // FIX: correct path — 'main/sermons' (plural, with main/ prefix)
    this.router.navigate(['main/sermons']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.sermonForm.get(fieldName);
    if (control?.hasError('required')) return 'This field is required';
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
