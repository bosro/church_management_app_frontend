
// src/app/features/auth/components/signup/signup.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth';

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

  churchSizeOptions = [
    { value: '1-50', label: '1-50 members' },
    { value: '51-200', label: '51-200 members' },
    { value: '201-500', label: '201-500 members' },
    { value: '501-1000', label: '501-1000 members' },
    { value: '1000+', label: '1000+ members' }
  ];

  positionOptions = [
    { value: 'senior_pastor', label: 'Senior Pastor' },
    { value: 'associate_pastor', label: 'Associate Pastor' },
    { value: 'church_administrator', label: 'Church Administrator' },
    { value: 'worship_leader', label: 'Worship Leader' },
    { value: 'youth_pastor', label: 'Youth Pastor' },
    { value: 'elder', label: 'Elder/Deacon' },
    { value: 'other', label: 'Other' }
  ];

  howHeardOptions = [
    { value: 'google_search', label: 'Google Search' },
    { value: 'social_media', label: 'Social Media' },
    { value: 'friend_referral', label: 'Friend/Colleague Referral' },
    { value: 'church_referral', label: 'Another Church' },
    { value: 'advertisement', label: 'Advertisement' },
    { value: 'other', label: 'Other' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.signupForm = this.fb.group({
      // Step 1: Basic Church Info
      full_name: ['', [Validators.required, Validators.minLength(3)]],
      church_name: ['', [Validators.required, Validators.minLength(3)]],
      church_location: ['', [Validators.required]],
      position: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10,15}$/)]],

      // Step 2: Additional Details
      church_size: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', [Validators.required]],
      how_heard: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirm_password')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  nextStep(): void {
    if (this.currentStep === 1) {
      // Validate step 1 fields
      const step1Fields = ['full_name', 'church_name', 'church_location', 'position', 'email', 'phone'];
      let isValid = true;

      step1Fields.forEach(field => {
        const control = this.signupForm.get(field);
        if (control?.invalid) {
          control.markAsTouched();
          isValid = false;
        }
      });

      if (isValid) {
        this.currentStep++;
      }
    } else if (this.currentStep === 2) {
      // Validate step 2 fields
      const step2Fields = ['church_size', 'password', 'confirm_password', 'how_heard'];
      let isValid = true;

      step2Fields.forEach(field => {
        const control = this.signupForm.get(field);
        if (control?.invalid) {
          control.markAsTouched();
          isValid = false;
        }
      });

      // Check password match
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
    }
  }

  submitSignup(): void {
    if (this.signupForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const signupData = {
      email: this.signupForm.value.email,
      password: this.signupForm.value.password,
      full_name: this.signupForm.value.full_name,
      church_name: this.signupForm.value.church_name,
      church_location: this.signupForm.value.church_location,
      position: this.signupForm.value.position,
      phone: this.signupForm.value.phone,
      church_size: this.signupForm.value.church_size,
      how_heard: this.signupForm.value.how_heard
    };

    this.authService.signUp(signupData).subscribe({
      next: (response) => {
        // Move to OTP verification step
        this.currentStep = 3;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Registration failed. Please try again.';
        // Go back to step 2 to show error
        if (this.currentStep === 3) {
          this.currentStep = 2;
        }
      }
    });
  }

  onOtpVerified(): void {
    // Navigate to dashboard after OTP verification
    this.router.navigate(['/dashboard']);
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
