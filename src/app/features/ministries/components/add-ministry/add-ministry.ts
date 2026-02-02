
// src/app/features/ministries/components/add-ministry/add-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';

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
  categories = [
    'Worship & Music',
    'Youth Ministry',
    'Children Ministry',
    'Men\'s Ministry',
    'Women\'s Ministry',
    'Outreach & Evangelism',
    'Prayer Ministry',
    'Media & Technology',
    'Hospitality',
    'Education',
    'Counseling',
    'Missions',
    'Other'
  ];

  constructor(
    private fb: FormBuilder,
    private ministriesService: MinistryService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.ministryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      category: ['', [Validators.required]],
      leader_name: ['', [Validators.required]],
      leader_email: ['', [Validators.email]],
      leader_phone: [''],
      meeting_schedule: [''],
      meeting_location: [''],
      requirements: [''],
      is_active: [true]
    });
  }

  onSubmit(): void {
    if (this.ministryForm.invalid) {
      this.markFormGroupTouched(this.ministryForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.ministriesService.createMinistry(this.ministryForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Ministry created successfully!';
          setTimeout(() => {
            this.router.navigate(['/ministries']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create ministry. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/ministries']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.ministryForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Invalid email address';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
