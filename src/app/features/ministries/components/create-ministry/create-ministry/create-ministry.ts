
// src/app/features/ministries/components/create-ministry/create-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../../services/ministry.service';

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

  daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  constructor(
    private fb: FormBuilder,
    private ministryService: MinistryService,
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
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      meeting_day: [''],
      meeting_time: [''],
      meeting_location: ['']
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

    const ministryData = this.ministryForm.value;

    this.ministryService.createMinistry(ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.successMessage = 'Ministry created successfully!';
          setTimeout(() => {
            this.router.navigate(['main/ministries', ministry.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create ministry. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/ministries']);
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
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
