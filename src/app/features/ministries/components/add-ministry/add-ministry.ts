// src/app/features/ministries/components/add-ministry/add-ministry.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

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

  // Permissions
  canManageMinistries = false;

  showUpgradeModal = false;
  upgradeModalTrigger = '';

  constructor(
    private fb: FormBuilder,
    private ministryService: MinistryService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
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
    const role = this.authService.getCurrentUserRole();

    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
    ];

    this.canManageMinistries =
      this.permissionService.isAdmin ||
      this.permissionService.ministries.manage ||
      manageRoles.includes(role);

    if (!this.canManageMinistries) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.ministryForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
        ],
      ],
      description: ['', [Validators.maxLength(500)]], // CHANGED TO 500
      category: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
        ],
      ],
      leader_name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      leader_email: ['', [Validators.email, Validators.maxLength(100)]],
      leader_phone: ['', [Validators.maxLength(20)]],
      meeting_schedule: ['', [Validators.maxLength(200)]],
      meeting_location: ['', [Validators.maxLength(200)]],
      requirements: ['', [Validators.maxLength(2000)]],
      is_active: [true],
    });
  }

  // CHARACTER COUNTER GETTER
  get descriptionLength(): number {
    const descriptionControl = this.ministryForm?.get('description');
    if (!descriptionControl) {
      return 0;
    }
    const value = descriptionControl.value;
    return value ? value.length : 0;
  }

  // Helper method to check if field is invalid
  isFieldInvalid(fieldName: string): boolean {
    const control = this.ministryForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }

  handleError(error: any, resourceLabel: string = 'item'): void {
    if (error.message?.startsWith('QUOTA_EXCEEDED:')) {
      const parts = error.message.split(':');
      const resource = parts[1];
      const limit = parts[3];

      const labels: Record<string, string> = {
        events: 'active event',
        ministries: 'department',
        forms: 'form',
      };

      const label = labels[resource] || resourceLabel;
      this.upgradeModalTrigger =
        `You've reached the ${limit} ${label} limit on your current plan. ` +
        `Upgrade to create more.`;
      this.showUpgradeModal = true;
      this.loading = false;
    } else {
      this.errorMessage = error.message || 'An error occurred';
      this.loading = false;
    }
  }

  onSubmit(): void {
    // console.log('Form submitted'); // DEBUG
    // console.log('Form valid:', this.ministryForm.valid); // DEBUG
    // console.log('Form value:', this.ministryForm.value); // DEBUG

    // Mark all fields as touched to show validation errors
    this.markFormGroupTouched(this.ministryForm);

    if (this.ministryForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly';

      // Show specific error for description length
      const descControl = this.ministryForm.get('description');
      if (descControl?.hasError('maxlength')) {
        this.errorMessage =
          'Description is too long. Maximum 500 characters allowed.'; // CHANGED TO 500
      }

      setTimeout(() => {
        this.scrollToFirstInvalidField();
      }, 100);

      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = this.ministryForm.value;

    // Prepare ministry data - SIMPLIFIED
    const ministryData = {
      name: formData.name?.trim() || '',
      description: formData.description?.trim() || null,
      category: formData.category?.trim().toLowerCase() || '', // lowercase to match DB
      meeting_schedule: formData.meeting_schedule?.trim() || null,
      meeting_location: formData.meeting_location?.trim() || null,
      requirements: formData.requirements?.trim() || null,
      is_active: formData.is_active ?? true,
    };

    // console.log('Sending to service:', ministryData); // DEBUG

    this.ministryService
      .createMinistry(ministryData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          // console.log('Ministry created:', ministry); // DEBUG
          this.successMessage = 'Ministry created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/ministries', ministry.id]);
          }, 1500);
        },

        error: (err) => {
          this.loading = false;
          this.handleError(err);
          this.scrollToTop();
        },
      });
  }

  cancel(): void {
    if (this.ministryForm.dirty) {
      if (
        confirm('You have unsaved changes. Are you sure you want to leave?')
      ) {
        this.router.navigate(['main/ministries']);
      }
    } else {
      this.router.navigate(['main/ministries']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
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

  private scrollToFirstInvalidField(): void {
    const firstInvalidControl: HTMLElement | null = document.querySelector(
      'input.error, textarea.error, select.error',
    );

    if (firstInvalidControl) {
      firstInvalidControl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      setTimeout(() => {
        firstInvalidControl.focus();
      }, 400);
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
