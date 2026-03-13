// src/app/features/settings/components/settings/settings.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SettingsService } from '../../services';
import { AuthService } from '../../../../core/services/auth';
import { SupabaseService } from '../../../../core/services/supabase';
import {
  Church,
  NotificationSettings,
  FinanceSettings,
  CommunicationSettings,
  SecuritySettings,
  TIMEZONES,
  CURRENCIES
} from '../../../../models/setting.model';

@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: string = 'general';
  churchProfile: Church | null = null;
  churchForm!: FormGroup;

  loading = false;
  loadingProfile = true;
  loadingSettings = false;
  savingSettings = false;
  uploadingLogo = false;
  errorMessage = '';
  successMessage = '';

  // Logo upload
  selectedLogoFile: File | null = null;
  logoPreviewUrl: string | null = null;

  // Settings state
  notificationSettings: NotificationSettings | null = null;
  financeSettings: FinanceSettings | null = null;
  communicationSettings: CommunicationSettings | null = null;
  securitySettings: SecuritySettings | null = null;

  // Permissions
  canManageSettings = false;
  canManageFinanceSettings = false;
  canManageSecuritySettings = false;

  // Options
  timezones = TIMEZONES;
  currencies = CURRENCIES;

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private authService: AuthService,
    private supabase: SupabaseService
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadChurchProfile();
    this.loadAllSettings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageSettings = this.settingsService.canManageSettings();
    this.canManageFinanceSettings = this.settingsService.canManageFinanceSettings();
    this.canManageSecuritySettings = this.settingsService.canManageSecuritySettings();
  }

  private initForm(): void {
    this.churchForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[+]?[\d\s()-]+$/)]],
      address: ['', [Validators.maxLength(200)]],
      city: ['', [Validators.maxLength(100)]],
      state: ['', [Validators.maxLength(100)]],
      country: ['', [Validators.maxLength(100)]],
      zip_code: ['', [Validators.maxLength(20)]],
      website: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      logo_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      timezone: [''],
      currency: ['GHS'],
      description: ['', [Validators.maxLength(500)]]
    });
  }

  private loadChurchProfile(): void {
    this.loadingProfile = true;
    this.errorMessage = '';

    this.settingsService.getChurchProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.churchProfile = profile;
          this.populateForm(profile);

          // Set logo preview if exists
          if (profile.logo_url) {
            this.logoPreviewUrl = profile.logo_url;
          }

          this.loadingProfile = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load church profile';
          this.loadingProfile = false;
          console.error('Error loading church profile:', error);
        }
      });
  }

  private loadAllSettings(): void {
    this.loadingSettings = true;

    this.settingsService.getAllSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (settings) => {
          this.notificationSettings = settings.notifications;
          this.financeSettings = settings.finance;
          this.communicationSettings = settings.communications;
          this.securitySettings = settings.security;
          this.loadingSettings = false;
        },
        error: (error) => {
          console.error('Error loading settings:', error);
          this.loadingSettings = false;
          this.initializeDefaultSettings();
        }
      });
  }

  private initializeDefaultSettings(): void {
    this.notificationSettings = {
      email_notifications: true,
      sms_notifications: false,
      event_reminders: true,
      new_member_alerts: true,
      donation_receipts: true
    };

    this.financeSettings = {
      online_giving: true,
      recurring_donations: true,
      auto_generate_receipts: true,
      tax_deductible_receipts: false
    };

    this.communicationSettings = {
      email_campaigns: true,
      sms_campaigns: true,
      automated_welcome_emails: true,
      birthday_greetings: true
    };

    this.securitySettings = {
      two_factor_authentication: false,
      session_timeout: true,
      login_notifications: true,
      data_export: true
    };
  }

  private populateForm(profile: Church): void {
    this.churchForm.patchValue({
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      country: profile.country || '',
      zip_code: profile.zip_code || '',
      website: profile.website || '',
      logo_url: profile.logo_url || '',
      timezone: profile.timezone || '',
      currency: profile.currency || 'GHS',
      description: profile.description || ''
    });
  }

  // ==================== LOGO UPLOAD ====================

  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.errorMessage = 'Please upload a valid image file (JPG, PNG, or WebP)';
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      this.errorMessage = 'Image size must be less than 5MB';
      return;
    }

    this.selectedLogoFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.logoPreviewUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    this.errorMessage = '';
  }

  async uploadLogo(): Promise<string | null> {
    if (!this.selectedLogoFile) {
      return null;
    }

    this.uploadingLogo = true;
    this.errorMessage = '';

    try {
      const churchId = this.authService.getChurchId();
      const timestamp = new Date().getTime();
      const fileExt = this.selectedLogoFile.name.split('.').pop();
      const fileName = `${churchId}/logo-${timestamp}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await this.supabase.client.storage
        .from('church-logos')
        .upload(fileName, this.selectedLogoFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = this.supabase.client.storage
        .from('church-logos')
        .getPublicUrl(fileName);

      this.uploadingLogo = false;
      return urlData.publicUrl;
    } catch (error: any) {
      this.uploadingLogo = false;
      console.error('Upload error:', error);
      this.errorMessage = error.message || 'Failed to upload logo';
      return null;
    }
  }

  removeLogo(): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = this.churchProfile?.logo_url || null;
    this.churchForm.patchValue({ logo_url: this.churchProfile?.logo_url || '' });

    // Reset file input
    const fileInput = document.getElementById('logo-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  // ==================== FORM SUBMISSION ====================

  async onSubmit(): Promise<void> {
    if (!this.canManageSettings) {
      this.errorMessage = 'You do not have permission to update settings';
      return;
    }

    if (this.churchForm.invalid) {
      this.markFormGroupTouched(this.churchForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToError();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // Upload logo if a new file was selected
      if (this.selectedLogoFile) {
        const logoUrl = await this.uploadLogo();
        if (logoUrl) {
          this.churchForm.patchValue({ logo_url: logoUrl });
        } else {
          this.loading = false;
          return; // Upload failed, error message already set
        }
      }

      const profileData = this.prepareProfileData();

      this.settingsService.updateChurchProfile(profileData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (profile) => {
            this.churchProfile = profile;
            this.logoPreviewUrl = profile.logo_url || null;
            this.selectedLogoFile = null;
            this.successMessage = 'Church profile updated successfully!';
            this.loading = false;
            this.scrollToTop();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.loading = false;
            this.errorMessage = error.message || 'Failed to update profile. Please try again.';
            this.scrollToTop();
            console.error('Error updating profile:', error);
          }
        });
    } catch (error: any) {
      this.loading = false;
      this.errorMessage = error.message || 'An error occurred';
      console.error('Error in onSubmit:', error);
    }
  }

  private prepareProfileData(): any {
    const formValue = this.churchForm.value;
    const profileData: any = {};

    Object.keys(formValue).forEach(key => {
      const value = formValue[key];
      if (value !== '' && value !== null && value !== undefined) {
        profileData[key] = value;
      }
    });

    return profileData;
  }

  // Tab Navigation
  switchTab(tab: string): void {
    this.activeTab = tab;
    this.clearMessages();
  }

  // Toggle Settings
  toggleNotificationSetting(key: keyof NotificationSettings): void {
    if (!this.notificationSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.notificationSettings,
      [key]: !this.notificationSettings[key]
    };

    this.settingsService.updateNotificationSettings(updatedSettings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notificationSettings = updatedSettings;
          this.successMessage = 'Setting updated successfully!';
          this.savingSettings = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 2000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update setting';
          this.savingSettings = false;
          console.error('Error updating setting:', error);
        }
      });
  }

  toggleFinanceSetting(key: keyof FinanceSettings): void {
    if (!this.canManageFinanceSettings) {
      this.errorMessage = 'You do not have permission to update finance settings';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (!this.financeSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.financeSettings,
      [key]: !this.financeSettings[key]
    };

    this.settingsService.updateFinanceSettings(updatedSettings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.financeSettings = updatedSettings;
          this.successMessage = 'Setting updated successfully!';
          this.savingSettings = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 2000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update setting';
          this.savingSettings = false;
          console.error('Error updating setting:', error);
        }
      });
  }

  toggleCommunicationSetting(key: keyof CommunicationSettings): void {
    if (!this.canManageSettings) {
      this.errorMessage = 'You do not have permission to update settings';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (!this.communicationSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.communicationSettings,
      [key]: !this.communicationSettings[key]
    };

    this.settingsService.updateCommunicationSettings(updatedSettings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.communicationSettings = updatedSettings;
          this.successMessage = 'Setting updated successfully!';
          this.savingSettings = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 2000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update setting';
          this.savingSettings = false;
          console.error('Error updating setting:', error);
        }
      });
  }

  toggleSecuritySetting(key: keyof SecuritySettings): void {
    if (!this.canManageSecuritySettings) {
      this.errorMessage = 'You do not have permission to update security settings';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (!this.securitySettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.securitySettings,
      [key]: !this.securitySettings[key]
    };

    this.settingsService.updateSecuritySettings(updatedSettings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.securitySettings = updatedSettings;
          this.successMessage = 'Setting updated successfully!';
          this.savingSettings = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 2000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update setting';
          this.savingSettings = false;
          console.error('Error updating setting:', error);
        }
      });
  }

  // Helper Methods
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.churchForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }
    if (control.hasError('pattern')) {
      if (fieldName === 'phone') {
        return 'Please enter a valid phone number';
      }
      if (fieldName === 'website' || fieldName === 'logo_url') {
        return 'Please enter a valid URL (starting with http:// or https://)';
      }
      return 'Invalid format';
    }

    return 'Invalid input';
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scrollToError(): void {
    const firstError = document.querySelector('.error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.scrollToTop();
    }
  }
}
