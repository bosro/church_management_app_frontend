
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';


@Component({
  selector: 'app-reset-password',
  standalone: false,
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  resetForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';
  isSuccess = false;

  showPassword = false;
  showConfirmPassword = false;

  // Token state
  tokenValid = false;
  tokenChecking = true;
  tokenError = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.handleTokenFromUrl();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.resetForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  private passwordMatchValidator(group: AbstractControl) {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }

  private async handleTokenFromUrl(): Promise<void> {
    // Supabase puts the tokens in the URL hash after redirect
    // Format: #access_token=...&refresh_token=...&type=recovery
    // OR it may come as query params with error if expired
    const hash = window.location.hash;
    const search = window.location.search;

    // Check for error in query params (expired link)
    const params = new URLSearchParams(search.replace(/^.*\?/, ''));
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorDesc = params.get('error_description') || hashParams.get('error_description');

    if (errorCode === 'otp_expired') {
      this.tokenChecking = false;
      this.tokenValid = false;
      this.tokenError = 'This password reset link has expired. Please request a new one.';
      return;
    }

    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');

    if (type === 'recovery' && accessToken && refreshToken) {
      // Set the session so the user can update their password
      const { error } = await this.supabase.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        this.tokenChecking = false;
        this.tokenValid = false;
        this.tokenError = 'Invalid or expired reset link. Please request a new one.';
      } else {
        this.tokenChecking = false;
        this.tokenValid = true;
        // Clean the URL hash so tokens aren't visible
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else {
      // No token found — possibly navigated here directly
      this.tokenChecking = false;
      this.tokenValid = false;
      this.tokenError = 'No reset token found. Please use the link from your email.';
    }
  }

  onSubmit(): void {
    if (this.resetForm.invalid) {
      Object.keys(this.resetForm.controls).forEach((key) =>
        this.resetForm.get(key)?.markAsTouched(),
      );
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { password } = this.resetForm.value;

    this.authService
      .updatePassword(password)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loading = false;
          this.isSuccess = true;
          this.successMessage = 'Your password has been updated successfully!';
          // Auto-redirect after 3 seconds
          setTimeout(() => this.router.navigate(['/auth/signin']), 3000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update password. Please try again.';
        },
      });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  goToLogin(): void {
    this.router.navigate(['/auth/signin']);
  }

  goToForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.resetForm.get(fieldName);
    if (control?.hasError('required')) return `${fieldName === 'password' ? 'Password' : 'Confirmation'} is required`;
    if (control?.hasError('minlength')) return 'Password must be at least 8 characters';
    if (fieldName === 'confirmPassword' && this.resetForm.hasError('passwordMismatch') && control?.touched)
      return 'Passwords do not match';
    return '';
  }

  getPasswordStrength(): { label: string; class: string; width: number } {
    const password = this.resetForm.get('password')?.value || '';
    if (!password) return { label: '', class: '', width: 0 };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { label: 'Weak', class: 'strength-weak', width: 20 };
    if (score <= 2) return { label: 'Fair', class: 'strength-fair', width: 40 };
    if (score <= 3) return { label: 'Good', class: 'strength-good', width: 60 };
    if (score <= 4) return { label: 'Strong', class: 'strength-strong', width: 80 };
    return { label: 'Very Strong', class: 'strength-very-strong', width: 100 };
  }
}
