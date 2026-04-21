// src/app/features/auth/components/signup/signup.component.ts

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { Church } from '../../../models/church.model';
import { ChurchService } from '../../../core/services/church.service';

@Component({
  selector: 'app-signup',
  standalone: false,
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup implements OnInit {
  currentStep = 1;
  totalSteps = 3;

  signupForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;
  showConfirmPassword = false;

  // ✅ NEW: Signup type and churches
  signupType: 'member' | 'admin' | null = null;
  churches: Church[] = [];
  loadingChurches = false;

  churchSizeOptions = [
    { value: '1-50', label: '1-50 members' },
    { value: '51-200', label: '51-200 members' },
    { value: '201-500', label: '201-500 members' },
    { value: '501-1000', label: '501-1000 members' },
    { value: '1000+', label: '1000+ members' },
  ];

  positionOptions = [
    { value: 'senior_pastor', label: 'Senior Pastor' },
    { value: 'associate_pastor', label: 'Associate Pastor' },
    { value: 'church_administrator', label: 'Church Administrator' },
    // { value: 'worship_leader', label: 'Worship Leader' },
    // { value: 'youth_pastor', label: 'Youth Pastor' },
    // { value: 'elder', label: 'Elder/Deacon' },
    // { value: 'other', label: 'Other' }
  ];

  howHeardOptions = [
    { value: 'google_search', label: 'Google Search' },
    { value: 'social_media', label: 'Social Media' },
    { value: 'friend_referral', label: 'Friend/Colleague Referral' },
    { value: 'church_referral', label: 'Another Church' },
    { value: 'advertisement', label: 'Advertisement' },
    { value: 'other', label: 'Other' },
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private churchService: ChurchService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.signupForm = this.fb.group(
      {
        // Common fields
        full_name: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]],
        phone: [
          '',
          [Validators.required, Validators.pattern(/^[0-9]{10,15}$/)],
        ],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirm_password: ['', [Validators.required]],

        // Member-specific
        church_id: [''],

        // Admin-specific
        position: [''],
        church_name: [''],
        church_location: [''],
        church_size: [''],
        how_heard: [''],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  // ✅ NEW: Select signup type
  selectSignupType(type: 'member' | 'admin'): void {
    this.signupType = type;
    this.currentStep = 1;
    this.errorMessage = '';

    if (type === 'member') {
      // Load churches for member signup
      this.loadChurches();

      // Clear admin fields and set member validators
      this.signupForm.get('church_id')?.setValidators([Validators.required]);
      this.signupForm.get('position')?.clearValidators();
      this.signupForm.get('church_name')?.clearValidators();
      this.signupForm.get('church_location')?.clearValidators();
      this.signupForm.get('church_size')?.clearValidators();
      this.signupForm.get('how_heard')?.clearValidators();
    } else {
      // Set admin validators
      this.signupForm.get('church_id')?.clearValidators();
      this.signupForm.get('position')?.setValidators([Validators.required]);
      this.signupForm
        .get('church_name')
        ?.setValidators([Validators.required, Validators.minLength(3)]);
      this.signupForm
        .get('church_location')
        ?.setValidators([Validators.required]);
      this.signupForm.get('church_size')?.setValidators([Validators.required]);
      this.signupForm.get('how_heard')?.setValidators([Validators.required]);
    }

    // Update validators
    Object.keys(this.signupForm.controls).forEach((key) => {
      this.signupForm.get(key)?.updateValueAndValidity();
    });
  }

  loadChurches(): void {
    this.loadingChurches = true;
    this.churchService.getAllChurches().subscribe({
      next: (churches) => {
        this.churches = churches;
        this.loadingChurches = false;
      },
      error: (error) => {
        console.error('Error loading churches:', error);
        this.errorMessage = 'Failed to load churches. Please try again.';
        this.loadingChurches = false;
      },
    });
  }

  // ✅ NEW: Check if email exists when church is selected
  onChurchSelected(): void {
    const email = this.signupForm.get('email')?.value;
    const churchId = this.signupForm.get('church_id')?.value;

    if (email && churchId && this.signupForm.get('email')?.valid) {
      this.churchService.checkEmailExistsInChurch(email, churchId).subscribe({
        next: (result) => {
          if (!result) {
            // Not in system — fresh signup
            this.errorMessage = '';
            this.successMessage = '';
            return;
          }

          if (result.has_auth_account) {
            // Already has full account
            this.errorMessage =
              'This email is already registered. Please sign in or use "Forgot Password" to reset your password.';
            this.successMessage = '';
          } else {
            // Admin pre-created this user
            this.errorMessage = '';
            this.successMessage =
              'Your account has been set up by your church admin. Complete registration to set your password.';
          }
        },
        error: (err) => {
          console.error('Error checking email:', err);
        },
      });
    }
  }

  passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirm_password')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // ✅ UPDATED: Handle different validation for member vs admin
  nextStep(): void {
    if (this.currentStep === 1) {
      let step1Fields: string[] = [];

      if (this.signupType === 'member') {
        step1Fields = ['full_name', 'email', 'phone', 'church_id'];
      } else {
        step1Fields = [
          'full_name',
          'church_name',
          'church_location',
          'position',
          'email',
          'phone',
        ];
      }

      let isValid = true;
      step1Fields.forEach((field) => {
        const control = this.signupForm.get(field);
        if (control?.invalid) {
          control.markAsTouched();
          isValid = false;
        }
      });

      if (isValid) {
        this.currentStep++;
        this.errorMessage = '';
      }
    } else if (this.currentStep === 2) {
      let step2Fields: string[] = [];

      if (this.signupType === 'member') {
        step2Fields = ['password', 'confirm_password'];
      } else {
        step2Fields = [
          'church_size',
          'password',
          'confirm_password',
          'how_heard',
        ];
      }

      let isValid = true;
      step2Fields.forEach((field) => {
        const control = this.signupForm.get(field);
        if (control?.invalid) {
          control.markAsTouched();
          isValid = false;
        }
      });

      if (this.signupForm.hasError('passwordMismatch')) {
        this.signupForm.get('confirm_password')?.setErrors({ mismatch: true });
        isValid = false;
      }

      if (isValid) {
        this.submitSignup();
      }
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.errorMessage = '';
      this.successMessage = '';
    }
  }

  backToTypeSelection(): void {
    this.signupType = null;
    this.currentStep = 1;
    this.errorMessage = '';
    this.signupForm.reset();
  }

  submitSignup(): void {
    if (this.signupForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const baseData = {
      email: this.signupForm.value.email,
      password: this.signupForm.value.password,
      full_name: this.signupForm.value.full_name,
      phone: this.signupForm.value.phone,
      signup_type: this.signupType!,
    };

    const signupData =
      this.signupType === 'member'
        ? {
            ...baseData,
            church_id: this.signupForm.value.church_id,
          }
        : {
            ...baseData,
            church_name: this.signupForm.value.church_name,
            church_location: this.signupForm.value.church_location,
            position: this.signupForm.value.position,
            church_size: this.signupForm.value.church_size,
            how_heard: this.signupForm.value.how_heard,
          };

    this.authService.signUp(signupData).subscribe({
      next: (response) => {
        // console.log('Signup successful:', response);
        this.loading = false;
        this.currentStep = 3;
        this.successMessage =
          response.message || 'Account created successfully!';
      },
      error: (error) => {
        this.loading = false;
        console.error('Signup error:', error);
        this.errorMessage =
          error.message || 'Registration failed. Please try again.';
      },
    });
  }

  goToSignIn(): void {
    this.router.navigate(['/auth/signin']);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.signupForm.get(fieldName);

    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control?.hasError('pattern')) {
      return 'Please enter a valid phone number';
    }
    if (fieldName === 'confirm_password' && control?.hasError('mismatch')) {
      return 'Passwords do not match';
    }
    return '';
  }
}









