
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
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
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: this.passwordMatchValidator });

    // Supabase puts the token in the URL hash — exchange it for a session
    this.supabase.client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        // Token from invite link has been exchanged — user is now in session
        this.verifying = false;
      } else if (event === 'PASSWORD_RECOVERY') {
        this.verifying = false;
      }
    });

    // Trigger session detection from URL hash
    this.supabase.client.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        this.verifying = false;
      } else {
        // Try to exchange the token from the URL
        this.supabase.client.auth.exchangeCodeForSession(
          window.location.href
        ).catch(() => {
          this.verifying = false;
        });
        setTimeout(() => { this.verifying = false; }, 2000);
      }
    });
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

    this.successMessage = 'Password set successfully! Redirecting...';
    setTimeout(() => {
      this.router.navigate(['/main/dashboard']);
    }, 2000);
  }

  getError(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength')) return 'Password must be at least 8 characters';
    return '';
  }

  get passwordMismatch(): boolean {
    return this.form.hasError('passwordMismatch') &&
           !!this.form.get('confirmPassword')?.touched;
  }
}
