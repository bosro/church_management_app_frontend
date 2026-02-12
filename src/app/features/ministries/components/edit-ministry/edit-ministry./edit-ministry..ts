

// src/app/features/ministries/components/edit-ministry/edit-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Ministry } from '../../../../../models/ministry.model';
import { MinistryService } from '../../../services/ministry.service';


@Component({
  selector: 'app-edit-ministry.',
  standalone: false,
  templateUrl: './edit-ministry..html',
  styleUrl: './edit-ministry..scss',
})
export class EditMinistry implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministryId: string = '';
  ministry: Ministry | null = null;
  ministryForm!: FormGroup;
  loading = false;
  loadingMinistry = true;
  errorMessage = '';
  successMessage = '';

  daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  constructor(
    private fb: FormBuilder,
    private ministryService: MinistryService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.ministryId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.ministryId) {
      this.loadMinistry();
    }
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

  private loadMinistry(): void {
    this.loadingMinistry = true;

    this.ministryService.getMinistryById(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.ministry = ministry;
          this.populateForm(ministry);
          this.loadingMinistry = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load ministry';
          this.loadingMinistry = false;
        }
      });
  }

  private populateForm(ministry: Ministry): void {
    this.ministryForm.patchValue({
      name: ministry.name,
      description: ministry.description,
      meeting_day: ministry.meeting_day,
      meeting_time: ministry.meeting_time,
      meeting_location: ministry.meeting_location
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

    this.ministryService.updateMinistry(this.ministryId, ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Ministry updated successfully!';
          setTimeout(() => {
            this.router.navigate(['main/ministries', this.ministryId]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update ministry. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/ministries', this.ministryId]);
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
