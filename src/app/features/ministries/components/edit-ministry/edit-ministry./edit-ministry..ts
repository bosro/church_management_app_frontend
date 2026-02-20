// src/app/features/ministries/components/edit-ministry/edit-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Ministry, DAYS_OF_WEEK } from '../../../../../models/ministry.model';
import { MinistryService } from '../../../services/ministry.service';

@Component({
  selector: 'app-edit-ministry',
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

  daysOfWeek = DAYS_OF_WEEK;

  // Permissions
  canManageMinistries = false;

  constructor(
    private fb: FormBuilder,
    private ministryService: MinistryService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.ministryId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();

    if (this.ministryId) {
      this.loadMinistry();
    } else {
      this.errorMessage = 'Invalid ministry ID';
      this.loadingMinistry = false;
    }
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

  private loadMinistry(): void {
    this.loadingMinistry = true;
    this.errorMessage = '';

    this.ministryService
      .getMinistryById(this.ministryId)
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
          console.error('Load ministry error:', error);
        }
      });
  }

  private populateForm(ministry: Ministry): void {
    this.ministryForm.patchValue({
      name: ministry.name,
      description: ministry.description || '',
      meeting_day: ministry.meeting_day || '',
      meeting_time: ministry.meeting_time || '',
      meeting_location: ministry.meeting_location || ''
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
      .updateMinistry(this.ministryId, ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Ministry updated successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/ministries', this.ministryId]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update ministry. Please try again.';
          this.scrollToTop();
          console.error('Update ministry error:', error);
        }
      });
  }

  cancel(): void {
    if (this.ministryForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/ministries', this.ministryId]);
      }
    } else {
      this.router.navigate(['main/ministries', this.ministryId]);
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
