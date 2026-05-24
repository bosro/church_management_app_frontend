// src/app/features/auth/components/signup/signup.component.ts
// CHANGES vs original:
// 1. recommendedPlan computed from church_size selection
// 2. getRecommendedPlan() and getRecommendedPlanPrice() helpers
// 3. upgradeAfterSignup() — initiates Paystack from step 3 success screen
// 4. SubscriptionPaystackService injected
// 5. Everything else (form logic, steps 1-2, admin/member flows) is UNCHANGED

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { Church } from '../../../models/church.model';
import { ChurchService } from '../../../core/services/church.service';
import { SubscriptionPaystackService } from '../../../core/services/subscription-paystack.service';

// Plan recommendation thresholds — matches your signup church_size options
// and your subscription_plans table
const SIZE_PLAN_MAP: Record<string, { planId: string; planName: string }> = {
  '1-50':    { planId: 'free',    planName: 'Free' },
  '51-200':  { planId: 'starter', planName: 'Starter' },
  '201-500': { planId: 'growth',  planName: 'Growth' },
  '501-1000':{ planId: 'pro',     planName: 'Pro' },
  '1000+':   { planId: 'pro',     planName: 'Pro' },
};

// Plan monthly prices — matches subscription_plans table
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 60,  yearly: 600  },
  growth:  { monthly: 100, yearly: 1000 },
  pro:     { monthly: 200, yearly: 2000 },
};

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

  signupType: 'member' | 'admin' | null = null;
  churches: Church[] = [];
  loadingChurches = false;

  // ── Plan upgrade state (step 3 for admin signups) ──────────────
  upgradeBillingEmail = '';
  upgradeProcessing = false;
  upgradeError = '';
  upgradeBillingCycle: 'monthly' | 'yearly' = 'monthly';
  // church_id is returned from handleAdminSignup via successMessage parsing —
  // we capture it in signupChurchId after submitSignup()
  signupChurchId: string | null = null;

  churchSizeOptions = [
    { value: '1-50',    label: '1-50 members' },
    { value: '51-200',  label: '51-200 members' },
    { value: '201-500', label: '201-500 members' },
    { value: '501-1000',label: '501-1000 members' },
    { value: '1000+',   label: '1000+ members' },
  ];

  positionOptions = [
    { value: 'church_administrator', label: 'Church Administrator' },
  ];

  howHeardOptions = [
    { value: 'google_search',   label: 'Google Search' },
    { value: 'social_media',    label: 'Social Media' },
    { value: 'friend_referral', label: 'Friend/Colleague Referral' },
    { value: 'church_referral', label: 'Another Church' },
    { value: 'advertisement',   label: 'Advertisement' },
    { value: 'other',           label: 'Other' },
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private churchService: ChurchService,
    private subscriptionPaystack: SubscriptionPaystackService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  // ── Plan recommendation helpers ─────────────────────────────────

  get selectedChurchSize(): string {
    return this.signupForm.get('church_size')?.value || '';
  }

  get recommendedPlan(): { planId: string; planName: string } | null {
    const size = this.selectedChurchSize;
    if (!size) return null;
    const rec = SIZE_PLAN_MAP[size];
    if (!rec || rec.planId === 'free') return null; // free plan needs no upgrade
    return rec;
  }

  get shouldShowUpgradeSuggestion(): boolean {
    return (
      this.signupType === 'admin' &&
      this.currentStep === 3 &&
      this.recommendedPlan !== null
    );
  }

  getRecommendedPlanPrice(): number {
    const plan = this.recommendedPlan;
    if (!plan) return 0;
    const prices = PLAN_PRICES[plan.planId];
    if (!prices) return 0;
    return this.upgradeBillingCycle === 'yearly' ? prices.yearly : prices.monthly;
  }

  getRecommendedPlanChargeAmount(): number {
    return this.subscriptionPaystack.calculateChargeAmount(this.getRecommendedPlanPrice());
  }

  getRecommendedPlanFee(): number {
    return this.subscriptionPaystack.calculateFeeAmount(this.getRecommendedPlanPrice());
  }

  get passFeesToPayer(): boolean {
    return this.subscriptionPaystack.passFeesToPayer;
  }

  getDurationMonths(): number {
    return this.upgradeBillingCycle === 'yearly' ? 12 : 1;
  }

  // ── Upgrade from step 3 ─────────────────────────────────────────

  async upgradeAfterSignup(): Promise<void> {
    const plan = this.recommendedPlan;
    if (!plan) return;

    if (!this.upgradeBillingEmail || !this.upgradeBillingEmail.includes('@')) {
      this.upgradeError = 'Please enter a valid billing email';
      return;
    }

    if (!this.signupChurchId) {
      this.upgradeError = 'Church not set up yet. Please sign in first, then upgrade from Settings.';
      return;
    }

    this.upgradeProcessing = true;
    this.upgradeError = '';

    try {
      const result = await this.subscriptionPaystack.initializePayment({
        planId: plan.planId,
        planName: plan.planName,
        durationMonths: this.getDurationMonths(),
        planPrice: this.getRecommendedPlanPrice(),
        billingEmail: this.upgradeBillingEmail,
        churchId: this.signupChurchId,
      });

      sessionStorage.setItem('subscription_pending_ref', result.reference);
      sessionStorage.setItem('subscription_plan_name', plan.planName);

      window.location.href = result.authorization_url;
    } catch (err: any) {
      this.upgradeProcessing = false;
      this.upgradeError = err.message || 'Payment initialization failed. You can upgrade later from Settings.';
    }
  }

  // ── All original methods below — UNCHANGED ──────────────────────

  private initForm(): void {
    this.signupForm = this.fb.group(
      {
        full_name:        ['', [Validators.required, Validators.minLength(3)]],
        email:            ['', [Validators.required, Validators.email]],
        phone:            ['', [Validators.required, Validators.pattern(/^[0-9]{10,15}$/)]],
        password:         ['', [Validators.required, Validators.minLength(8)]],
        confirm_password: ['', [Validators.required]],
        church_id:        [''],
        position:         [''],
        church_name:      [''],
        church_location:  [''],
        church_size:      [''],
        how_heard:        [''],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  selectSignupType(type: 'member' | 'admin'): void {
    this.signupType = type;
    this.currentStep = 1;
    this.errorMessage = '';

    if (type === 'member') {
      this.loadChurches();
      this.signupForm.get('church_id')?.setValidators([Validators.required]);
      this.signupForm.get('position')?.clearValidators();
      this.signupForm.get('church_name')?.clearValidators();
      this.signupForm.get('church_location')?.clearValidators();
      this.signupForm.get('church_size')?.clearValidators();
      this.signupForm.get('how_heard')?.clearValidators();
    } else {
      this.signupForm.get('church_id')?.clearValidators();
      this.signupForm.get('position')?.setValidators([Validators.required]);
      this.signupForm.get('church_name')?.setValidators([Validators.required, Validators.minLength(3)]);
      this.signupForm.get('church_location')?.setValidators([Validators.required]);
      this.signupForm.get('church_size')?.setValidators([Validators.required]);
      this.signupForm.get('how_heard')?.setValidators([Validators.required]);
    }

    Object.keys(this.signupForm.controls).forEach((key) => {
      this.signupForm.get(key)?.updateValueAndValidity();
    });
  }

  loadChurches(): void {
    this.loadingChurches = true;
    this.churchService.getAllChurches().subscribe({
      next: (churches) => { this.churches = churches; this.loadingChurches = false; },
      error: (error) => {
        console.error('Error loading churches:', error);
        this.errorMessage = 'Failed to load churches. Please try again.';
        this.loadingChurches = false;
      },
    });
  }

  onChurchSelected(): void {
    const email = this.signupForm.get('email')?.value;
    const churchId = this.signupForm.get('church_id')?.value;

    if (email && churchId && this.signupForm.get('email')?.valid) {
      this.churchService.checkEmailExistsInChurch(email, churchId).subscribe({
        next: (result) => {
          if (!result) { this.errorMessage = ''; this.successMessage = ''; return; }
          if (result.has_auth_account) {
            this.errorMessage = 'This email is already registered. Please sign in or use "Forgot Password".';
            this.successMessage = '';
          } else {
            this.errorMessage = '';
            this.successMessage = 'Your account has been set up by your church admin. Complete registration to set your password.';
          }
        },
        error: (err) => console.error('Error checking email:', err),
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

  togglePasswordVisibility(): void { this.showPassword = !this.showPassword; }
  toggleConfirmPasswordVisibility(): void { this.showConfirmPassword = !this.showConfirmPassword; }

  nextStep(): void {
    if (this.currentStep === 1) {
      const step1Fields = this.signupType === 'member'
        ? ['full_name', 'email', 'phone', 'church_id']
        : ['full_name', 'church_name', 'church_location', 'position', 'email', 'phone'];

      let isValid = true;
      step1Fields.forEach((field) => {
        const control = this.signupForm.get(field);
        if (control?.invalid) { control.markAsTouched(); isValid = false; }
      });

      if (isValid) { this.currentStep++; this.errorMessage = ''; }
    } else if (this.currentStep === 2) {
      const step2Fields = this.signupType === 'member'
        ? ['password', 'confirm_password']
        : ['church_size', 'password', 'confirm_password', 'how_heard'];

      let isValid = true;
      step2Fields.forEach((field) => {
        const control = this.signupForm.get(field);
        if (control?.invalid) { control.markAsTouched(); isValid = false; }
      });

      if (this.signupForm.hasError('passwordMismatch')) {
        this.signupForm.get('confirm_password')?.setErrors({ mismatch: true });
        isValid = false;
      }

      if (isValid) { this.submitSignup(); }
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) { this.currentStep--; this.errorMessage = ''; this.successMessage = ''; }
  }

  backToTypeSelection(): void {
    this.signupType = null; this.currentStep = 1; this.errorMessage = ''; this.signupForm.reset();
  }

  submitSignup(): void {
    if (this.signupForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const baseData = {
      email:       this.signupForm.value.email,
      password:    this.signupForm.value.password,
      full_name:   this.signupForm.value.full_name,
      phone:       this.signupForm.value.phone,
      signup_type: this.signupType!,
    };

    const signupData = this.signupType === 'member'
      ? { ...baseData, church_id: this.signupForm.value.church_id }
      : {
          ...baseData,
          church_name:      this.signupForm.value.church_name,
          church_location:  this.signupForm.value.church_location,
          position:         this.signupForm.value.position,
          church_size:      this.signupForm.value.church_size,
          how_heard:        this.signupForm.value.how_heard,
        };

    this.authService.signUp(signupData).subscribe({
      next: (response) => {
        this.loading = false;
        this.currentStep = 3;
        this.successMessage = response.message || 'Account created successfully!';

        // Capture the church_id returned from handleAdminSignup
        // so upgradeAfterSignup() can use it
        if (response.church_id) {
          this.signupChurchId = response.church_id;
        }

        // Pre-fill billing email with the signup email
        this.upgradeBillingEmail = this.signupForm.value.email || '';
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Registration failed. Please try again.';
      },
    });
  }

  goToSignIn(): void { this.router.navigate(['/auth/signin']); }

  getErrorMessage(fieldName: string): string {
    const control = this.signupForm.get(fieldName);
    if (control?.hasError('required')) return 'This field is required';
    if (control?.hasError('email')) return 'Please enter a valid email address';
    if (control?.hasError('minlength')) {
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    }
    if (control?.hasError('pattern')) return 'Please enter a valid phone number';
    if (fieldName === 'confirm_password' && control?.hasError('mismatch')) return 'Passwords do not match';
    return '';
  }
}
