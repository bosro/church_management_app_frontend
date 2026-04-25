// src/app/features/public/member-registration/member-registration.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegistrationLinkService } from '../../members/services/registration-link.service';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-member-registration',
  standalone: false,
  templateUrl: './member-registration.html',
  styleUrl: './member-registration.scss',
})
export class MemberRegistration implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Token / link state ────────────────────────────────────
  token = '';
  validating = true;
  valid = false;
  invalidReason = '';

  // ── Church branding (fetched after validate) ──────────────
  churchId = '';
  churchName = '';
  churchLogo: string | null = null;

  // ── Form state ────────────────────────────────────────────
  form!: FormGroup;
  submitting = false;
  submitted = false;
  errorMessage = '';
  createdMemberNumber = '';

  // ── Options ───────────────────────────────────────────────
  genderOptions = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
  ];

  maritalStatusOptions = [
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'divorced', label: 'Divorced' },
    { value: 'widowed', label: 'Widowed' },
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private linkService: RegistrationLinkService,
    private supabase: SupabaseService,
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
    const today = new Date().toISOString().split('T')[0];

    this.form = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      marital_status: [''],
      phone_primary: [
        '',
        [Validators.required, Validators.pattern(/^0[0-9]{9}$/)],
      ],
      phone_secondary: ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      email: ['', [Validators.email]],
      address: [''],
      city: [''],
      occupation: [''],
      emergency_contact_name: [''],
      emergency_contact_phone: ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      emergency_contact_relationship: [''],
      join_date: [today, [Validators.required]],
    });
  }

  private validateLink(): void {
    this.validating = true;

    this.linkService
      .validateLink(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result?.success) {
            this.valid = true;
            this.churchId = result.church_id;
            this.fetchChurchBranding(result.church_id);
          } else {
            this.valid = false;
            this.invalidReason =
              result?.error || 'Invalid or expired registration link';
            this.validating = false;
          }
        },
        error: (error) => {
          this.valid = false;
          this.invalidReason =
            error?.message || 'Failed to validate registration link';
          this.validating = false;
        },
      });
  }

  /**
   * Pull church name + logo so we can show them in the header.
   * If anything fails we just keep generic copy — never blocks the form.
   */
  private async fetchChurchBranding(churchId: string): Promise<void> {
    try {
      const { data } = await this.supabase.client
        .from('churches')
        .select('name, logo_url')
        .eq('id', churchId)
        .maybeSingle();

      if (data) {
        this.churchName = data.name || '';
        this.churchLogo = data.logo_url || null;
      }
    } catch {
      /* non-critical, keep generic header */
    } finally {
      this.validating = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => c.markAsTouched());
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    try {
      const { data, error } = await this.supabase.client.rpc(
        'register_member_via_link',
        {
          p_link_token: this.token,
          p_member_data: this.form.value,
        },
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Registration failed');
      }

      this.submitted = true;
      this.createdMemberNumber = data.member_number || '';
    } catch (error: any) {
      this.errorMessage =
        error.message || 'Registration failed. Please try again.';
    } finally {
      this.submitting = false;
    }
  }

  registerAnother(): void {
    this.submitted = false;
    this.createdMemberNumber = '';
    this.errorMessage = '';
    const today = new Date().toISOString().split('T')[0];
    this.form.reset({ join_date: today });
  }

  getError(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('email')) return 'Invalid email address';
    if (control.hasError('pattern'))
      return 'Invalid phone (must be 10 digits starting with 0)';
    return 'Invalid input';
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }
}
