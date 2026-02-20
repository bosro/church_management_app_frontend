// src/app/features/branches/components/create-branch/create-branch.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BranchesService } from '../../services/branches';

@Component({
  selector: 'app-create-branch',
  standalone: false,
  templateUrl: './create-branch.html',
  styleUrl: './create-branch.scss',
})
export class CreateBranch implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branchForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canManageBranches = false;

  constructor(
    private fb: FormBuilder,
    private branchesService: BranchesService,
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
    this.canManageBranches = this.branchesService.canManageBranches();

    if (!this.canManageBranches) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.branchForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      pastor_name: ['', [Validators.maxLength(100)]],
      address: ['', [Validators.maxLength(200)]],
      city: ['', [Validators.maxLength(100)]],
      state: ['', [Validators.maxLength(100)]],
      country: ['', [Validators.maxLength(100)]],
      phone: ['', [Validators.maxLength(20)]],
      email: ['', [Validators.email, Validators.maxLength(100)]],
      established_date: ['']
    });
  }

  onSubmit(): void {
    if (this.branchForm.invalid) {
      this.markFormGroupTouched(this.branchForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    // Validate established date
    if (this.branchForm.value.established_date) {
      const establishedDate = new Date(this.branchForm.value.established_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (establishedDate > today) {
        this.errorMessage = 'Established date cannot be in the future';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.branchesService
      .createBranch(this.branchForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (branch) => {
          this.successMessage = 'Branch created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/branches', branch.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create branch. Please try again.';
          this.scrollToTop();
          console.error('Create branch error:', error);
        }
      });
  }

  cancel(): void {
    if (this.branchForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/branches']);
      }
    } else {
      this.router.navigate(['main/branches']);
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
    const control = this.branchForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('email')) {
      return 'Please enter a valid email address';
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
