// src/app/features/ministries/components/add-ministry/add-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { MINISTRY_CATEGORIES } from '../../../../models/ministry.model';

@Component({
  selector: 'app-add-ministry',
  standalone: false,
  templateUrl: './add-ministry.html',
  styleUrl: './add-ministry.scss',
})
export class AddMinistry implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministryForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Ministry Categories
  categories = MINISTRY_CATEGORIES;

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
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
      category: ['', [Validators.required]],
      leader_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      leader_email: ['', [Validators.email, Validators.maxLength(100)]],
      leader_phone: ['', [Validators.maxLength(20)]],
      meeting_schedule: ['', [Validators.maxLength(200)]],
      meeting_location: ['', [Validators.maxLength(200)]],
      requirements: ['', [Validators.maxLength(500)]],
      is_active: [true]
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

    const formData = this.ministryForm.value;

    // Prepare ministry data
    const ministryData = {
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      category: formData.category,
      meeting_schedule: formData.meeting_schedule?.trim() || null,
      meeting_location: formData.meeting_location?.trim() || null,
      requirements: formData.requirements?.trim() || null,
      is_active: formData.is_active
    };

    this.ministryService
      .createMinistry(ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.successMessage = 'Ministry created successfully!';
          this.loading = false;

          // TODO: If leader info provided, create leader record
          // This would require additional service methods

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
    if (control.hasError('email')) {
      return 'Invalid email address';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
