import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-accept-invite',
  standalone: false,
  templateUrl: './accept-invite.html',
  styleUrl: './accept-invite.scss',
})
export class AcceptInvite implements OnInit {
  form!: FormGroup;
  loading = false;
  verifying = true;
  errorMessage = '';
  successMessage = '';
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );

    this.checkSession();
  }

  private async checkSession(): Promise<void> {
    // Wait for auth service to fully initialize and process hash token
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const {
      data: { session },
    } = await this.supabase.client.auth.getSession();

    if (session) {
      this.verifying = false;
    } else {
      this.errorMessage =
        'Invitation link is invalid or has expired. Please ask your admin to send a new invite.';
      this.verifying = false;
    }
  }

  private async handleInviteToken(): Promise<void> {
    // First check if there's already a valid session
    const {
      data: { session },
    } = await this.supabase.client.auth.getSession();

    if (session) {
      this.verifying = false;
      return;
    }

    // Parse the URL hash manually — Supabase puts invite tokens here
    const hash = window.location.hash;

    if (hash) {
      // Parse hash params: #access_token=...&token_type=bearer&type=invite
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (
        accessToken &&
        (type === 'invite' || type === 'recovery' || type === 'signup')
      ) {
        try {
          // Set the session using the tokens from the URL
          const { data, error } = await this.supabase.client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (error) {
            console.error('setSession error:', error);
            this.errorMessage =
              'This invitation link is invalid or has expired. Please ask your admin to send a new invite.';
          } else if (data.session) {
            // Session established — user can now set their password
            console.log('Session established for invite');
          }
        } catch (err: any) {
          this.errorMessage =
            'Failed to verify invitation. Please try again or request a new invite.';
        }
      } else if (!accessToken) {
        this.errorMessage =
          'Invalid invitation link. Please use the full link from your email.';
      }
    } else {
      // No hash — check if it's a PKCE code flow (query param)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        try {
          const { error } =
            await this.supabase.client.auth.exchangeCodeForSession(code);
          if (error) {
            this.errorMessage =
              'This invitation link is invalid or has expired.';
          }
        } catch (err) {
          this.errorMessage = 'Failed to verify invitation.';
        }
      } else {
        this.errorMessage =
          'No invitation token found. Please use the full link from your email.';
      }
    }

    this.verifying = false;
  }

  private passwordMatchValidator(group: AbstractControl) {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }

  async setPassword(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { error } = await this.supabase.client.auth.updateUser({
      password: this.form.value.password,
    });

    if (error) {
      this.errorMessage = error.message;
      this.loading = false;
      return;
    }

    this.successMessage = 'Account activated! Redirecting to your dashboard...';
    setTimeout(() => {
      this.router.navigate(['/main/dashboard']);
    }, 2000);
  }

  getError(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return 'Password must be at least 8 characters';
    return '';
  }

  get passwordMismatch(): boolean {
    return (
      this.form.hasError('passwordMismatch') &&
      !!this.form.get('confirmPassword')?.touched
    );
  }
}
