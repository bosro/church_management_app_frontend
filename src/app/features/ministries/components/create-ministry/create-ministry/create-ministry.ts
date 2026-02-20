// src/app/features/ministries/components/create-ministry/create-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../../services/ministry.service';
import { DAYS_OF_WEEK } from '../../../../../models/ministry.model';

@Component({
  selector: 'app-create-ministry',
  standalone: false,
  templateUrl: './create-ministry.html',
  styleUrl: './create-ministry.scss',
})
export class CreateMinistry implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministryForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  daysOfWeek = DAYS_OF_WEEK;

  // Permissions
  canManageMinistries = false;

  constructor(
    private fb: FormBuilder,
    private ministryService: MinistryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageMinistries = this.ministryService.canManageMinistries();

    if (!this.canManageMinistries) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.ministryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
      meeting_day: [''],
      meeting_time: ['', [Validators.pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)]],
      meeting_location: ['', [Validators.maxLength(200)]]
    });
  }

  onSubmit(): void {
    if (this.ministryForm.invalid) {
      this.markFormGroupTouched(this.ministryForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const ministryData = this.ministryForm.value;

    this.ministryService
      .createMinistry(ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.successMessage = 'Ministry created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/ministries', ministry.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create ministry. Please try again.';
          this.scrollToTop();
          console.error('Create ministry error:', error);
        }
      });
  }

  cancel(): void {
    if (this.ministryForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/ministries']);
      }
    } else {
      this.router.navigate(['main/ministries']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.ministryForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }
    if (control.hasError('pattern')) {
      if (fieldName === 'meeting_time') {
        return 'Invalid time format. Use HH:MM (e.g., 14:30)';
      }
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
