// src/app/features/building-campaign/components/commitment-form/commitment-form.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { MemberService } from '../../../members/services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { Member } from '../../../../models/member.model';
import { BuildingCampaignService } from '../../services/building-campaign.service';
import { SupabaseService } from '../../../../core/services/supabase';

@Component({
  selector: 'app-commitment-form',
  standalone: false,
  templateUrl: './commitment-form.html',
  styleUrl: './commitment-form.scss',
})
export class CommitmentForm implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  form!: FormGroup;
  submitting = false;
  submitted = false;
  errorMessage = '';

  pledgerType: 'member' | 'visitor' = 'member';

  // Member search
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;
  selectedMember: Member | null = null;

  paymentMethods = [
    'Bank Transfer — GT Bank',
    'Mobile Money (MTN)',
    'Mobile Money (Vodafone)',
    'Cash / Offering Box',
  ];

  isPublic = false;

  showPaymentOption = false;
  payNow = false;
  initialPaymentAmount: number = 0;
  payerEmail = '';
  paymentLoading = false;
  paymentError = '';
  submittedCommitmentId = '';

  // Computed preview
  get instalmentPreview(): number {
    const total = +this.form?.get('total_pledge_amount')?.value || 0;
    const initial = +this.form?.get('initial_payment')?.value || 0;
    const count = +this.form?.get('instalment_count')?.value || 0;
    if (count <= 0) return 0;
    return Math.round(((total - initial) / count) * 100) / 100;
  }

  get remainingAfterInitial(): number {
    const total = +this.form?.get('total_pledge_amount')?.value || 0;
    const initial = +this.form?.get('initial_payment')?.value || 0;
    return Math.max(0, total - initial);
  }

  get frequencyLabel(): string {
    return this.form?.get('instalment_frequency')?.value === 'weekly'
      ? 'week'
      : 'month';
  }

  get frequencyLabelPlural(): string {
    return this.form?.get('instalment_frequency')?.value === 'weekly'
      ? 'weeks'
      : 'months';
  }

  churchIdFromUrl = '';
  churchIdFromRoute = '';
  constructor(
    private fb: FormBuilder,
    private campaignService: BuildingCampaignService,
    private memberService: MemberService,
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute,
    private supabase: SupabaseService,
  ) {}

  ngOnInit(): void {
    this.churchIdFromRoute = this.route.snapshot.paramMap.get('churchId') || '';
    // If churchId is in the route params, we're on the public link
    this.isPublic = !!this.churchIdFromRoute;
    this.initForm();
    this.setupMemberSearch();

    const role = this.authService.getCurrentUserRole();
    if (role === 'member') {
      this.pledgerType = 'member';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.form = this.fb.group({
      // Visitor fields
      visitor_name: [''],
      visitor_contact: [''],

      // Pledge amounts
      total_pledge_amount: ['', [Validators.required, Validators.min(1)]],
      initial_payment: [0, [Validators.required, Validators.min(0)]],

      // Schedule
      instalment_frequency: ['weekly', Validators.required],
      instalment_count: [
        '',
        [Validators.required, Validators.min(1), Validators.max(260)],
      ],

      // Payment
      payment_method: [''],
      notes: [''],
      consent: [false, Validators.requiredTrue],
    });

    // Validate initial_payment <= total_pledge_amount
    this.form
      .get('total_pledge_amount')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.validateInitialPayment());
    this.form
      .get('initial_payment')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.validateInitialPayment());
  }

  private validateInitialPayment(): void {
    const total = +this.form.get('total_pledge_amount')?.value || 0;
    const initial = +this.form.get('initial_payment')?.value || 0;
    const ctrl = this.form.get('initial_payment');
    if (initial > total && total > 0) {
      ctrl?.setErrors({ exceedsTotal: true });
    } else {
      if (ctrl?.hasError('exceedsTotal')) {
        ctrl.setErrors(null);
      }
    }
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (!q || q.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.memberService.searchMembers(q);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: () => {
          this.searching = false;
          this.searchResults = [];
        },
      });
  }

  // Call this after successful commitment submission instead of navigating away
  onCommitmentSubmitted(commitmentId: string, initialAmount: number): void {
    this.submittedCommitmentId = commitmentId;
    this.initialPaymentAmount = initialAmount;
    this.showPaymentOption = true; // show the payment step
  }

  async initiatePayment(): Promise<void> {
    if (!this.initialPaymentAmount || this.initialPaymentAmount <= 0) return;
    this.paymentLoading = true;
    this.paymentError = '';

    const supabaseClient = this.supabase.client as any;
    const supabaseUrl =
      supabaseClient.supabaseUrl ??
      supabaseClient.rest?.url?.replace('/rest/v1', '') ??
      '';

    // Get the anon key — it's stored on the client instance
    const anonKey =
      supabaseClient.supabaseKey ?? supabaseClient.headers?.apikey ?? '';

    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/paystack-initialize-public`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey, // ← fixes the auth error
            Authorization: `Bearer ${anonKey}`, // ← Supabase expects both
          },
          body: JSON.stringify({
            church_id: this.churchIdFromRoute || this.authService.getChurchId(),
            commitment_id: this.submittedCommitmentId,
            amount: this.initialPaymentAmount,
            payer_name:
              this.form.value.visitor_name ||
              (this.selectedMember
                ? `${this.selectedMember.first_name} ${this.selectedMember.last_name}`
                : 'Anonymous'),
            payer_contact: this.form.value.visitor_contact || '',
            payer_email: this.payerEmail || undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        this.paymentError = data.error || 'Could not initiate payment';
        this.paymentLoading = false;
        return;
      }
      window.location.href = data.authorization_url;
    } catch (e: any) {
      this.paymentError = e.message || 'Unexpected error';
      this.paymentLoading = false;
    }
  }

  skipPayment(): void {
    this.showPaymentOption = false;
    // Navigate to success/thank you page
    this.router.navigate(['/public/building-campaign/thank-you']);
  }

  selectMember(member: Member): void {
    this.selectedMember = member;
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  removeMember(): void {
    this.selectedMember = null;
  }

  setPledgerType(type: 'member' | 'visitor'): void {
    this.pledgerType = type;
    this.errorMessage = '';
    if (type === 'member') {
      this.form.patchValue({ visitor_name: '', visitor_contact: '' });
    } else {
      this.selectedMember = null;
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  setFrequency(freq: 'weekly' | 'monthly'): void {
    this.form.patchValue({ instalment_frequency: freq });
  }

  onSubmit(): void {
    this.errorMessage = '';

    // PUBLIC route: validate name + phone directly
    if (this.isPublic) {
      const name = this.form.get('visitor_name')?.value?.trim();
      const contact = this.form.get('visitor_contact')?.value?.trim();
      if (!name || !contact) {
        this.errorMessage = 'Please enter your full name and phone number.';
        return;
      }
    } else {
      // ADMIN route: validate member selection or visitor fields
      if (this.pledgerType === 'member' && !this.selectedMember) {
        this.errorMessage = 'Please select a member.';
        return;
      }
      if (this.pledgerType === 'visitor') {
        const name = this.form.get('visitor_name')?.value?.trim();
        const contact = this.form.get('visitor_contact')?.value?.trim();
        if (!name || !contact) {
          this.errorMessage = 'Please enter your full name and contact number.';
          return;
        }
      }
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill in all required fields.';
      return;
    }

    const v = this.form.value;
    const total = +v.total_pledge_amount;
    const initial = +v.initial_payment;

    if (initial > total) {
      this.errorMessage = 'Initial payment cannot exceed the total pledge.';
      return;
    }
    if (!v.consent) {
      this.errorMessage = 'Please tick the commitment checkbox.';
      return;
    }

    this.submitting = true;

    const dto: any = {
      church_id: this.churchIdFromRoute || undefined,
      total_pledge_amount: total,
      initial_payment: initial,
      instalment_frequency: v.instalment_frequency,
      instalment_count: +v.instalment_count,
      payment_method: v.payment_method || null,
      notes: v.notes || null,
      campaign_name: 'The Rich Church',
    };

    if (this.isPublic) {
      dto.visitor_name = v.visitor_name.trim();
      dto.visitor_contact = v.visitor_contact.trim();
    } else if (this.pledgerType === 'member') {
      dto.member_id = this.selectedMember!.id;
    } else {
      dto.visitor_name = v.visitor_name.trim();
      dto.visitor_contact = v.visitor_contact.trim();
    }

    this.campaignService
      .createCommitment(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (commitment) => {
          // ← capture the returned commitment
          this.submitting = false;
          this.submitted = true;

          // If there's an initial payment amount, show the payment step
          const initial = +this.form.value.initial_payment || 0;
          if (initial > 0 && this.isPublic) {
            this.onCommitmentSubmitted(commitment.id, initial);
          }

          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (err) => {
          this.submitting = false;
          this.errorMessage =
            err.message || 'Could not save your commitment. Please try again.';
        },
      });
  }

  submitAnother(): void {
    this.submitted = false;
    this.form.reset({
      instalment_frequency: 'weekly',
      initial_payment: 0,
      consent: false,
    });
    this.selectedMember = null;
    this.pledgerType = 'member';
  }

  getMemberName(m: Member): string {
    return `${m.first_name} ${m.last_name}`;
  }
  getMemberInitials(m: Member): string {
    return `${m.first_name[0]}${m.last_name[0]}`.toUpperCase();
  }

  getError(field: string): string {
    const c = this.form.get(field);
    if (!c?.errors || !c.touched) return '';
    if (c.hasError('required')) return 'This field is required';
    if (c.hasError('min')) return 'Must be greater than 0';
    if (c.hasError('max')) return 'Value is too large';
    if (c.hasError('exceedsTotal')) return 'Cannot exceed total pledge amount';
    return 'Invalid value';
  }

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(n || 0);
  }

  goBack(): void {
    if (this.isPublic) {
      // On public form, just go back in browser history
      window.history.back();
    } else {
      this.router.navigate(['/main/building-campaign']);
    }
  }
}
