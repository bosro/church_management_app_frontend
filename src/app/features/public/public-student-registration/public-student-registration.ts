// src/app/features/public/components/public-student-registration/public-student-registration.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StudentRegistrationLinkService } from '../../reports/services/student-registration-link.service';

@Component({
  selector: 'app-public-student-registration',
  standalone: false,
  templateUrl: './public-student-registration.html',
  styleUrl: './public-student-registration.scss',
})
export class PublicStudentRegistration implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  token = '';
  validating = true;
  valid = false;
  invalidReason = '';

  churchName = '';
  churchLogo: string | null = null;
  classes: { id: string; name: string; academic_year: string }[] = [];
  preferredClassId: string | null = null;

  form!: FormGroup;
  submitting = false;
  submitted = false;
  errorMessage = '';
  successMessage = '';
  createdStudentNumber = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private linkService: StudentRegistrationLinkService,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.initForm();

    if (!this.token) {
      this.validating = false;
      this.invalidReason = 'Missing link token';
      return;
    }

    this.validateLink();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.form = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      class_id: ['', Validators.required],
      parent_name: ['', Validators.required],
      parent_phone: ['', [Validators.required, Validators.pattern(/^0[0-9]{9}$/)]],
      parent_email: ['', Validators.email],
      address: [''],
    });
  }

  validateLink(): void {
    this.validating = true;
    this.linkService
      .validateLink(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.validating = false;
          if (!result?.valid) {
            this.valid = false;
            this.invalidReason = result?.reason || 'Invalid link';
            return;
          }
          this.valid = true;
          this.churchName = result.church_name || 'School';
          this.churchLogo = result.church_logo || null;
          this.classes = result.classes || [];
          this.preferredClassId = result.preferred_class_id || null;

          // If link is restricted to a class, pre-fill and lock it
          if (this.preferredClassId) {
            this.form.patchValue({ class_id: this.preferredClassId });
            this.form.get('class_id')?.disable();
          }
        },
        error: (err) => {
          this.validating = false;
          this.valid = false;
          this.invalidReason = err.message || 'Failed to validate link';
        },
      });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => c.markAsTouched());
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const formValue = this.form.getRawValue();
    const payload = {
      first_name: formValue.first_name.trim(),
      middle_name: formValue.middle_name?.trim() || null,
      last_name: formValue.last_name.trim(),
      date_of_birth: formValue.date_of_birth || null,
      gender: formValue.gender || null,
      class_id: formValue.class_id,
      parent_name: formValue.parent_name?.trim() || null,
      parent_phone: formValue.parent_phone?.trim() || null,
      parent_email: formValue.parent_email?.trim() || null,
      address: formValue.address?.trim() || null,
    };

    this.linkService
      .submitRegistration(this.token, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.submitting = false;
          if (result?.success) {
            this.submitted = true;
            this.createdStudentNumber = result.student_number || '';
          } else {
            this.errorMessage = result?.error || 'Registration failed';
          }
        },
        error: (err) => {
          this.submitting = false;
          this.errorMessage = err.message || 'Registration failed';
        },
      });
  }

  registerAnother(): void {
    this.submitted = false;
    this.createdStudentNumber = '';
    this.errorMessage = '';
    this.form.reset();
    if (this.preferredClassId) {
      this.form.patchValue({ class_id: this.preferredClassId });
    }
  }

  getError(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('email')) return 'Invalid email address';
    if (control.hasError('pattern')) return 'Invalid phone (must be 10 digits starting with 0)';
    return 'Invalid input';
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }
}
