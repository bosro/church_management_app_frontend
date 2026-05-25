
// src/app/features/admin/sms-settings/sms-settings.component.ts
// Super admin page for managing SMS provider configuration.
// Route: /main/admin/sms-settings
// Add to AdminModule declarations and admin-routing.module.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SmsSettingsService, SmsProvider } from '../../../core/services/sms-settings.service';

@Component({
  selector: 'app-sms-settings',
  standalone: false,
  templateUrl: './sms-settings.html',
  styleUrl: './sms-settings.scss',
})
export class SmsSettings implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  saving = false;
  testing = false;
  errorMessage = '';
  successMessage = '';
  testResult: { success: boolean; message: string } | null = null;

  settingsForm!: FormGroup;
  testPhone = '';

  // Which credential section is expanded
  showGiantSmsInfo = false;
  showHubtelInfo = false;

  providers: { value: SmsProvider; label: string; icon: string; description: string }[] = [
    {
      value: 'giantsms',
      label: 'GiantSMS',
      icon: 'ri-message-3-line',
      description: 'Ghanaian SMS provider. Sender ID requires registration and approval.',
    },
    {
      value: 'hubtel',
      label: 'Hubtel',
      icon: 'ri-chat-smile-3-line',
      description: 'Hubtel Programmable SMS. Sender ID can be set per-church without pre-approval.',
    },
  ];

  constructor(
    private fb: FormBuilder,
    private smsSettingsService: SmsSettingsService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadSettings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.settingsForm = this.fb.group({
      provider: ['giantsms', Validators.required],
      defaultSenderId: ['CHURCHMAN', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(11),
        Validators.pattern(/^[a-zA-Z0-9_\/&@."',*#\+!? ]+$/),
      ]],
    });
  }

  private loadSettings(): void {
    this.loading = true;
    this.smsSettingsService.getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (settings) => {
          this.settingsForm.patchValue({
            provider: settings.provider,
            defaultSenderId: settings.defaultSenderId,
          });
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load settings';
          this.loading = false;
        },
      });
  }

  get selectedProvider(): SmsProvider {
    return this.settingsForm.get('provider')?.value;
  }

  selectProvider(provider: SmsProvider): void {
    this.settingsForm.patchValue({ provider });
    this.testResult = null;
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) return;

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.smsSettingsService.saveSettings({
      provider: this.settingsForm.value.provider,
      defaultSenderId: this.settingsForm.value.defaultSenderId.trim(),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saving = false;
          this.successMessage = 'SMS provider settings saved. Changes take effect on the next send.';
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => {
          this.saving = false;
          this.errorMessage = err.message || 'Failed to save settings';
        },
      });
  }

  sendTestSms(): void {
    if (!this.testPhone || this.testPhone.length < 10) {
      this.errorMessage = 'Enter a valid phone number to test';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    this.testing = true;
    this.testResult = null;

    this.smsSettingsService.sendTestSms(this.testPhone, this.selectedProvider)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.testing = false;
          this.testResult = result;
        },
        error: (err) => {
          this.testing = false;
          this.testResult = {
            success: false,
            message: err.message || 'Test failed — check your credentials in Supabase secrets',
          };
        },
      });
  }

  getProviderStatusLabel(): string {
    return this.selectedProvider === 'hubtel' ? 'Hubtel Active' : 'GiantSMS Active';
  }

  getSenderIdHint(): string {
    return 'Max 11 characters. Letters, numbers, and some special characters allowed. ' +
      (this.selectedProvider === 'giantsms'
        ? 'Must be an approved sender ID on your GiantSMS account.'
        : 'Hubtel allows custom sender IDs without pre-approval.');
  }
}
