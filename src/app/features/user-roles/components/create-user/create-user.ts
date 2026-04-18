// src/app/features/user-roles/components/create-user/create-user.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserRolesService } from '../../services/user-roles';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-create-user',
  standalone: false,
  templateUrl: './create-user.html',
  styleUrl: './create-user.scss',
})
export class CreateUser implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  userForm!: FormGroup;
  submitting = false;
  errorMessage = '';

  canManagePermissions = false;

  readonly roles = [
    { value: 'church_admin', label: 'Church Admin' },
    { value: 'pastor', label: 'Pastor' },
    { value: 'senior_pastor', label: 'Senior Pastor' },
    { value: 'associate_pastor', label: 'Associate Pastor' },
    { value: 'finance_officer', label: 'Finance Officer' },
    { value: 'ministry_leader', label: 'Ministry Leader' },
    { value: 'group_leader', label: 'Group Leader' },
    { value: 'cell_leader', label: 'Cell Leader' }, // ← ADD
    { value: 'elder', label: 'Elder' },
    { value: 'deacon', label: 'Deacon' },
    { value: 'worship_leader', label: 'Worship Leader' },
    { value: 'member', label: 'Member' },
  ];

  showUpgradeModal = false;
  upgradeModalTrigger = '';

  constructor(
    private fb: FormBuilder,
    private userRolesService: UserRolesService,
    private authService: AuthService,
    private router: Router,
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
    this.canManagePermissions = this.userRolesService.canManagePermissions();
    if (!this.canManagePermissions) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      full_name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      phone_number: ['', [Validators.pattern(/^\+?[0-9\s\-().]{7,20}$/)]],
      role: ['member', [Validators.required]],
    });
  }

  handleError(error: any): void {
    if (error.message?.startsWith('QUOTA_EXCEEDED:')) {
      const parts = error.message.split(':');
      const limit = parts[3];
      this.upgradeModalTrigger =
        `You've reached the ${limit} staff user limit on your current plan. ` +
        `Upgrade to add more users.`;
      this.showUpgradeModal = true;
      this.submitting = false;
    } else if (
      error.message?.includes('already been registered') ||
      error.message?.includes('already registered') ||
      error.message?.includes('User already registered') ||
      error.message?.includes('already exists')
    ) {
      this.errorMessage =
        `A user with the email "${this.userForm.value.email}" is already registered. ` +
        `Please use a different email address or manage the existing user from the Users list.`;
      this.submitting = false;
    } else {
      this.errorMessage =
        error.message || 'Failed to create user. Please try again.';
      this.submitting = false;
    }
  }

  createUser(): void {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      this.errorMessage = 'Please fill in all required fields correctly.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const payload = {
      full_name: this.userForm.value.full_name.trim(),
      email: this.userForm.value.email.trim().toLowerCase(),
      phone_number: this.userForm.value.phone_number?.trim() || null,
      role: this.userForm.value.role,
    };

    this.userRolesService
      .createUser(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newUser) => {
          this.submitting = false;
          this.errorMessage = '';

          // Temporarily show success before redirect
          // Replace with your ToastService if available
          const successMsg = document.createElement('div');
          successMsg.style.cssText = `
    position: fixed; top: 1rem; right: 1rem; z-index: 9999;
    background: #D1FAE5; border: 1px solid #6EE7B7; color: #065F46;
    padding: 1rem 1.5rem; border-radius: 8px; font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  `;
          successMsg.innerHTML = `✅ User invited successfully! An email has been sent to ${this.userForm.value.email}. Redirecting to permissions...`;
          document.body.appendChild(successMsg);

          setTimeout(() => {
            document.body.removeChild(successMsg);
            this.router.navigate(
              ['main/user-roles/manage-permission', newUser.id, 'permissions'],
              { queryParams: { new: 'true' } }, // ← signals to pre-grant defaults
            );
          }, 2500);
        },
        error: (error) => {
          this.handleError(error);
        },
      });
  }

  goBack(): void {
    this.router.navigate(['main/user-roles']);
  }

  getFormError(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';

    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('email')) return 'Please enter a valid email address';
    if (control.hasError('minlength')) {
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      return `Maximum ${control.getError('maxlength').requiredLength} characters allowed`;
    }
    if (control.hasError('pattern')) return 'Please enter a valid phone number';

    return 'Invalid input';
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

  clearError(): void {
    this.errorMessage = '';
  }

  getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      church_admin: 'ri-shield-star-line',
      pastor: 'ri-book-open-line',
      senior_pastor: 'ri-book-open-line',
      associate_pastor: 'ri-book-open-line',
      finance_officer: 'ri-money-dollar-circle-line',
      ministry_leader: 'ri-service-line',
      group_leader: 'ri-group-line',
      cell_leader: 'ri-group-2-line', // ← ADD
      elder: 'ri-award-line', // ← ADD
      deacon: 'ri-user-star-line', // ← ADD
      worship_leader: 'ri-music-line', // ← ADD
      member: 'ri-user-line',
    };
    return icons[role] || 'ri-user-line';
  }
}



