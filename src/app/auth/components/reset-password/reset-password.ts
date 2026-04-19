// src/app/features/auth/components/reset-password/reset-password.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-reset-password',
  standalone: false,
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  resetForm!: FormGroup;

  // UI state
  verifying = true;
  sessionReady = false;
  linkExpired = false;
  loading = false;
  resetComplete = false;

  // Messages
  errorMessage = '';
  successMessage = '';

  // Password field toggles
  showPassword = false;
  showConfirmPassword = false;

  // Password strength
  passwordStrength: 'weak' | 'medium' | 'strong' | '' = '';

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    this.initForm();
    await this.handleRecoveryLink();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.resetForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );

    this.resetForm.get('password')?.valueChanges.subscribe((value: string) => {
      this.passwordStrength = this.calculatePasswordStrength(value || '');
    });
  }

  private passwordMatchValidator(
    group: AbstractControl,
  ): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  private calculatePasswordStrength(
    password: string,
  ): 'weak' | 'medium' | 'strong' | '' {
    if (!password) return '';
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return 'weak';
    if (score <= 3) return 'medium';
    return 'strong';
  }

  /**
   * Handles every possible shape Supabase might redirect with:
   *   A) token_hash  (recommended — survives email scanner prefetch)
   *   B) code        (PKCE flow — supabase-js v2 default)
   *   C) hash fragment with access_token + refresh_token (implicit flow)
   *   D) error in query or hash (link already expired/consumed)
   */
  private async handleRecoveryLink(): Promise<void> {
    this.verifying = true;
    this.errorMessage = '';
    this.linkExpired = false;

    try {
      const queryParams = this.route.snapshot.queryParamMap;
      const hash = window.location.hash.substring(1);
      const hashParams = hash ? new URLSearchParams(hash) : null;

      // --- D) Check for errors FIRST ---
      const queryError = queryParams.get('error');
      const queryErrorCode = queryParams.get('error_code');
      const queryErrorDesc = queryParams.get('error_description');

      const hashError = hashParams?.get('error');
      const hashErrorCode = hashParams?.get('error_code');
      const hashErrorDesc = hashParams?.get('error_description');

      const errorCode = queryErrorCode || hashErrorCode;
      const errorDesc = queryErrorDesc || hashErrorDesc;
      const errorName = queryError || hashError;

      if (errorName || errorCode) {
        if (
          errorCode === 'otp_expired' ||
          errorDesc?.toLowerCase().includes('expired') ||
          errorDesc?.toLowerCase().includes('invalid')
        ) {
          this.linkExpired = true;
        }
        throw new Error(
          errorDesc?.replace(/\+/g, ' ') ||
            'This password reset link is invalid or has expired.',
        );
      }

      // --- A) token_hash flow (preferred — scanner-proof) ---
      const tokenHash = queryParams.get('token_hash');
      const type = queryParams.get('type');

      if (tokenHash && type === 'recovery') {
        const { data, error } = await this.supabase.client.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });
        if (error) throw error;
        if (data.session) {
          this.sessionReady = true;
          this.verifying = false;
          history.replaceState(null, '', window.location.pathname);
          return;
        }
      }

      // --- B) PKCE code flow ---
      const code = queryParams.get('code');
      if (code) {
        const { data, error } =
          await this.supabase.client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data.session) {
          this.sessionReady = true;
          this.verifying = false;
          history.replaceState(null, '', window.location.pathname);
          return;
        }
      }

      // --- C) Implicit hash-fragment flow ---
      if (hashParams) {
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const hashType = hashParams.get('type');

        if (accessToken && refreshToken && hashType === 'recovery') {
          const { data, error } = await this.supabase.client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data.session) {
            this.sessionReady = true;
            this.verifying = false;
            history.replaceState(null, '', window.location.pathname);
            return;
          }
        }
      }

      // --- Fallback: already have a valid session ---
      const { data: sessionData } =
        await this.supabase.client.auth.getSession();
      if (sessionData.session) {
        this.sessionReady = true;
        this.verifying = false;
        return;
      }

      // Nothing matched — treat as expired/invalid
      this.linkExpired = true;
      throw new Error(
        'Invalid or expired reset link. Please request a new password reset.',
      );
    } catch (err: any) {
      console.error('Recovery link error:', err);
      this.sessionReady = false;
      this.verifying = false;

      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid')) {
        this.linkExpired = true;
      }

      this.errorMessage =
        err?.message ||
        'This password reset link is invalid or has expired. Please request a new one.';
    }
  }

  onSubmit(): void {
    if (this.resetForm.invalid || !this.sessionReady) {
      this.markFormGroupTouched(this.resetForm);
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { password } = this.resetForm.value;

    this.supabase.client.auth
      .updateUser({ password })
      .then(({ error }) => {
        this.loading = false;
        if (error) {
          this.errorMessage = error.message || 'Failed to update password.';
          return;
        }
        this.resetComplete = true;
        this.successMessage =
          'Password updated successfully! Redirecting to sign-in...';
        setTimeout(async () => {
          try {
            await this.supabase.client.auth.signOut();
          } catch {
            // ignore
          }
          this.router.navigate(['/auth/signin']);
        }, 2500);
      })
      .catch((error) => {
        this.loading = false;
        this.errorMessage = error?.message || 'Failed to update password.';
      });
  }

  requestNewLink(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  goToLogin(): void {
    this.router.navigate(['/auth/signin']);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      formGroup.get(key)?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.resetForm.get(fieldName);
    if (control?.hasError('required')) {
      return fieldName === 'password'
        ? 'Password is required'
        : 'Please confirm your password';
    }
    if (control?.hasError('minlength')) {
      return 'Password must be at least 8 characters';
    }
    if (
      fieldName === 'confirmPassword' &&
      this.resetForm.hasError('passwordMismatch') &&
      control?.touched
    ) {
      return 'Passwords do not match';
    }
    return '';
  }
}
