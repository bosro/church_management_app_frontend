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

  registrationForm!: FormGroup;
  loading = false;
  validatingLink = true;
  linkValid = false;
  errorMessage = '';
  successMessage = '';

  linkToken = '';
  churchId = '';

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
    this.linkToken = this.route.snapshot.paramMap.get('token') || '';

    if (!this.linkToken) {
      this.errorMessage = 'Invalid registration link';
      this.validatingLink = false;
      return;
    }

    this.initForm();
    this.validateLink();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.registrationForm = this.fb.group({
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
    this.validatingLink = true;

    this.linkService
      .validateLink(this.linkToken)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.success) {
            this.linkValid = true;
            this.churchId = result.church_id;
            this.validatingLink = false;
          } else {
            this.linkValid = false;
            this.errorMessage =
              result.error || 'Invalid or expired registration link';
            this.validatingLink = false;
          }
        },
        error: (error) => {
          this.linkValid = false;
          this.errorMessage = 'Failed to validate registration link';
          this.validatingLink = false;
        },
      });
  }

  async onSubmit(): Promise<void> {
    if (this.registrationForm.invalid) {
      this.markFormGroupTouched(this.registrationForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const { data, error } = await this.supabase.client.rpc(
        'register_member_via_link',
        {
          p_link_token: this.linkToken,
          p_member_data: this.registrationForm.value,
        },
      );

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      this.successMessage =
        'Registration successful! Thank you for joining us.';
      this.registrationForm.reset();

      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    } catch (error: any) {
      this.errorMessage =
        error.message || 'Registration failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }
}
