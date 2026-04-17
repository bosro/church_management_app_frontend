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
  CURRENCIES,
} from '../../../../models/setting.model';
import { PermissionService } from '../../../../core/services/permission.service';
import {
  SubscriptionService,
  SubscriptionStatus,
} from '../../../../core/services/subscription.service';
import { ActivatedRoute } from '@angular/router';

interface MemberProfile {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  phone_primary?: string;
  phone_secondary?: string;
  email?: string;
  address?: string;
  city?: string;
  occupation?: string;
  employer?: string;
  photo_url?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: string = 'general';

  userRole: string = '';
  isMember: boolean = false;
  isAdmin: boolean = false;

  churchProfile: Church | null = null;
  churchForm!: FormGroup;

  memberProfile: MemberProfile | null = null;
  memberForm!: FormGroup;

  loading = false;
  loadingProfile = true;
  loadingSettings = false;
  savingSettings = false;
  uploadingPhoto = false;
  errorMessage = '';
  successMessage = '';

  selectedPhotoFile: File | null = null;
  photoPreviewUrl: string | null = null;

  notificationSettings: NotificationSettings | null = null;
  financeSettings: FinanceSettings | null = null;
  communicationSettings: CommunicationSettings | null = null;
  securitySettings: SecuritySettings | null = null;

  canManageSettings = false;
  canManageFinanceSettings = false;
  canManageSecuritySettings = false;

  timezones = TIMEZONES;
  currencies = CURRENCIES;

  subscriptionStatus: SubscriptionStatus | null = null;
  loadingSubscription = false;
  showUpgradeModal = false;
  upgradeModalTrigger = '';

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private authService: AuthService,
    private supabase: SupabaseService,
    public permissionService: PermissionService,
    private subscriptionService: SubscriptionService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.checkUserRole();
    this.checkPermissions();
    this.initForms();

    // ✅ FIX: Set default active tab based on role
    if (this.isMember) {
      this.activeTab = 'profile';
    } else {
      this.activeTab = 'general';
    }

    // ← ADD THIS: Read ?tab= query param and override default
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['tab'] && !this.isMember) {
          this.activeTab = params['tab'];
        }
      });

    this.loadProfileData();
    this.loadSubscriptionStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSubscriptionStatus(): void {
    if (this.isMember) return;

    // Super admins have no church — subscription not applicable
    const churchId = this.authService.getChurchId();
    if (!churchId) {
      this.loadingSubscription = false;
      return;
    }

    this.loadingSubscription = true;
    this.subscriptionService.loadStatus().then(() => {
      this.subscriptionStatus = this.subscriptionService.currentStatus;
      this.loadingSubscription = false;
    });
  }

  private checkUserRole(): void {
    this.authService.currentProfile$.subscribe((profile) => {
      if (profile) {
        this.userRole = profile.role;
        this.isMember = profile.role === 'member';
        this.isAdmin = [
          'super_admin',
          'church_admin',
          'pastor',
          'finance_officer',
        ].includes(profile.role);

        if (this.isMember) {
          this.activeTab = 'profile';
        } else if (this.isAdmin) {
          this.activeTab = 'general';
        }
      }
    });
  }

  private checkPermissions(): void {
    this.canManageSettings =
      this.permissionService.isAdmin || this.permissionService.settings.manage;

    this.canManageFinanceSettings =
      this.permissionService.isAdmin || this.permissionService.finance.manage;

    this.canManageSecuritySettings =
      this.permissionService.isAdmin || this.permissionService.settings.manage;
  }

  private initForms(): void {
    this.churchForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[+]?[\d\s()-]+$/)]],
      address: ['', [Validators.maxLength(200)]],
      city: ['', [Validators.maxLength(100)]],
      state: ['', [Validators.maxLength(100)]],
      country: ['', [Validators.maxLength(100)]],
      zip_code: ['', [Validators.maxLength(20)]],
      website: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      logo_url: [''],
      timezone: [''],
      currency: ['GHS'],
      description: ['', [Validators.maxLength(500)]],
    });

    this.memberForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      marital_status: [''],
      phone_primary: ['', [Validators.pattern(/^[+]?[\d\s()-]+$/)]],
      phone_secondary: ['', [Validators.pattern(/^[+]?[\d\s()-]+$/)]],
      email: ['', [Validators.email]],
      address: [''],
      city: [''],
      occupation: [''],
      employer: [''],
      photo_url: [''],
      emergency_contact_name: [''],
      emergency_contact_phone: ['', [Validators.pattern(/^[+]?[\d\s()-]+$/)]],
      emergency_contact_relationship: [''],
    });
  }

  private loadProfileData(): void {
    if (this.isMember) {
      this.loadMemberProfile();
    } else if (this.isAdmin) {
      this.loadChurchProfile();
      this.loadAllSettings();
    }
  }

  async loadMemberProfile(): Promise<void> {
    this.loadingProfile = true;
    this.errorMessage = '';

    const userId = this.authService.getUserId();
    const churchId = this.authService.getChurchId();

    try {
      // Step 1: Try to find existing member record
      let { data: memberData, error: fetchError } = await this.supabase.client
        .from('members')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching member profile:', fetchError);
        this.errorMessage = 'Failed to load your profile';
        this.loadingProfile = false;
        return;
      }

      // Step 2: If no member found, create one
      if (!memberData) {
        // console.log('📝 No member record found, creating one...');

        // Get user profile data from profiles table
        const { data: profileData, error: profileError } =
          await this.supabase.client
            .from('profiles')
            .select('email, full_name, avatar_url')
            .eq('id', userId)
            .single();

        if (profileError) {
          console.error('Error fetching profile data:', profileError);
          this.errorMessage = 'Failed to load user data';
          this.loadingProfile = false;
          return;
        }

        // Parse the full name
        const nameParts = (profileData?.full_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Create the member record
        const { data: newMember, error: createError } =
          await this.supabase.client.rpc('create_member_profile');

        if (createError) {
          console.error('❌ Error creating member profile:', createError);
          this.errorMessage =
            'Failed to create your profile. Please contact your administrator.';
          this.loadingProfile = false;
          return;
        }

        // console.log('✅ Member profile created via function');
        memberData = newMember;
      }

      // Step 3: Load the member data
      this.memberProfile = memberData as MemberProfile;
      this.populateMemberForm(memberData);

      if (memberData.photo_url) {
        this.photoPreviewUrl = memberData.photo_url;
      }

      // console.log('✅ Member profile loaded:', {
      //   id: memberData.id,
      //   name: `${memberData.first_name} ${memberData.last_name}`,
      //   hasPhoto: !!memberData.photo_url,
      // });

      this.loadingProfile = false;
    } catch (err: any) {
      console.error('💥 Unexpected error in loadMemberProfile:', err);
      this.errorMessage = 'An unexpected error occurred. Please try again.';
      this.loadingProfile = false;
    }
  }

  private populateMemberForm(profile: any): void {
    this.memberForm.patchValue({
      first_name: profile.first_name || '',
      middle_name: profile.middle_name || '',
      last_name: profile.last_name || '',
      date_of_birth: profile.date_of_birth || '',
      gender: profile.gender || '',
      marital_status: profile.marital_status || '',
      phone_primary: profile.phone_primary || '',
      phone_secondary: profile.phone_secondary || '',
      email: profile.email || '',
      address: profile.address || '',
      city: profile.city || '',
      occupation: profile.occupation || '',
      employer: profile.employer || '',
      photo_url: profile.photo_url || '',
      emergency_contact_name: profile.emergency_contact_name || '',
      emergency_contact_phone: profile.emergency_contact_phone || '',
      emergency_contact_relationship:
        profile.emergency_contact_relationship || '',
    });
  }

  // ✅ Add this helper method to the class
  private prepareUpdateData(formValue: any): any {
    const updateData: any = {};

    Object.keys(formValue).forEach((key) => {
      const value = formValue[key];

      // Convert empty strings to null for database compatibility
      if (value === '' || value === null || value === undefined) {
        updateData[key] = null;
      } else {
        updateData[key] = value;
      }
    });

    return updateData;
  }

  // Then use it in saveMemberProfile:
  async saveMemberProfile(): Promise<void> {
    if (this.memberForm.invalid) {
      this.markFormGroupTouched(this.memberForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToError();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const userId = this.authService.getUserId();
      let photoUrl = this.memberForm.value.photo_url;

      if (this.selectedPhotoFile) {
        photoUrl = await this.uploadPhoto();
        if (photoUrl) {
          this.memberForm.patchValue({ photo_url: photoUrl });

          await this.supabase.client
            .from('profiles')
            .update({ avatar_url: photoUrl })
            .eq('id', userId);
        }
      }

      // ✅ Use the helper method
      const updateData = this.prepareUpdateData(this.memberForm.value);

      const { error } = await this.supabase.client
        .from('members')
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;

      this.successMessage = 'Profile updated successfully!';
      this.selectedPhotoFile = null;
      this.loading = false;
      this.scrollToTop();

      await this.loadMemberProfile();
      this.authService.refreshProfile();

      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    } catch (error: any) {
      this.loading = false;
      this.errorMessage = error.message || 'Failed to update profile';
      this.scrollToTop();
      console.error('Error updating member profile:', error);
    }
  }

  loadChurchProfile(): void {
    this.loadingProfile = true;
    this.errorMessage = '';

    this.settingsService
      .getChurchProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.churchProfile = profile;
          this.populateChurchForm(profile);

          if (profile.logo_url) {
            this.photoPreviewUrl = profile.logo_url;
          }

          this.loadingProfile = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load church profile';
          this.loadingProfile = false;
          console.error('Error loading church profile:', error);
        },
      });
  }

  private loadAllSettings(): void {
    this.loadingSettings = true;

    this.settingsService
      .getAllSettings()
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
        },
      });
  }

  private populateChurchForm(profile: Church): void {
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
      description: profile.description || '',
    });
  }

  onPhotoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.errorMessage =
        'Please upload a valid image file (JPG, PNG, or WebP)';
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.errorMessage = 'Image size must be less than 5MB';
      return;
    }

    this.selectedPhotoFile = file;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.photoPreviewUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    this.errorMessage = '';
  }

  async uploadPhoto(): Promise<string | null> {
    if (!this.selectedPhotoFile) {
      return null;
    }

    this.uploadingPhoto = true;
    this.errorMessage = '';

    try {
      const userId = this.authService.getUserId();
      const timestamp = new Date().getTime();
      const fileExt = this.selectedPhotoFile.name.split('.').pop();
      const fileName = this.isMember
        ? `members/${userId}/photo-${timestamp}.${fileExt}`
        : `churches/${this.authService.getChurchId()}/logo-${timestamp}.${fileExt}`;

      const bucketName = this.isMember ? 'member-photos' : 'church-logos';

      const { data, error } = await this.supabase.client.storage
        .from(bucketName)
        .upload(fileName, this.selectedPhotoFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = this.supabase.client.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      this.uploadingPhoto = false;
      return urlData.publicUrl;
    } catch (error: any) {
      this.uploadingPhoto = false;
      console.error('Upload error:', error);
      this.errorMessage = error.message || 'Failed to upload photo';
      return null;
    }
  }

  removePhoto(): void {
    this.selectedPhotoFile = null;
    if (this.isMember) {
      this.photoPreviewUrl = this.memberProfile?.photo_url || null;
      this.memberForm.patchValue({
        photo_url: this.memberProfile?.photo_url || '',
      });
    } else {
      this.photoPreviewUrl = this.churchProfile?.logo_url || null;
      this.churchForm.patchValue({
        logo_url: this.churchProfile?.logo_url || '',
      });
    }

    const fileInput = document.getElementById('photo-file') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  async saveChurchProfile(): Promise<void> {
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
      let logoUrl = this.churchForm.value.logo_url;

      if (this.selectedPhotoFile) {
        logoUrl = await this.uploadPhoto();
        if (logoUrl) {
          this.churchForm.patchValue({ logo_url: logoUrl });
        } else {
          this.loading = false;
          return;
        }
      }

      const profileData = this.prepareProfileData();

      this.settingsService
        .updateChurchProfile(profileData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (profile) => {
            this.churchProfile = profile;
            this.photoPreviewUrl = profile.logo_url || null;
            this.selectedPhotoFile = null;
            this.successMessage = 'Church profile updated successfully!';
            this.loading = false;
            this.scrollToTop();

            // ✅ Refresh church profile in header
            this.settingsService.refreshChurchProfile();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.loading = false;
            this.errorMessage = error.message || 'Failed to update profile';
            this.scrollToTop();
            console.error('Error updating profile:', error);
          },
        });
    } catch (error: any) {
      this.loading = false;
      this.errorMessage = error.message || 'An error occurred';
      console.error('Error in saveChurchProfile:', error);
    }
  }

  private prepareProfileData(): any {
    const formValue = this.churchForm.value;
    const profileData: any = {};

    Object.keys(formValue).forEach((key) => {
      const value = formValue[key];
      if (value !== '' && value !== null && value !== undefined) {
        profileData[key] = value;
      }
    });

    return profileData;
  }

  switchTab(tab: string): void {
    this.activeTab = tab;
    this.clearMessages();
  }

  toggleNotificationSetting(key: keyof NotificationSettings): void {
    if (!this.notificationSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.notificationSettings,
      [key]: !this.notificationSettings[key],
    };

    this.settingsService
      .updateNotificationSettings(updatedSettings)
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
        },
      });
  }

  toggleFinanceSetting(key: keyof FinanceSettings): void {
    if (!this.canManageFinanceSettings) {
      this.errorMessage =
        'You do not have permission to update finance settings';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    if (!this.financeSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.financeSettings,
      [key]: !this.financeSettings[key],
    };

    this.settingsService
      .updateFinanceSettings(updatedSettings)
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
        },
      });
  }

  toggleCommunicationSetting(key: keyof CommunicationSettings): void {
    if (!this.canManageSettings) {
      this.errorMessage = 'You do not have permission to update settings';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    if (!this.communicationSettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.communicationSettings,
      [key]: !this.communicationSettings[key],
    };

    this.settingsService
      .updateCommunicationSettings(updatedSettings)
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
        },
      });
  }

  toggleSecuritySetting(key: keyof SecuritySettings): void {
    if (!this.canManageSecuritySettings) {
      this.errorMessage =
        'You do not have permission to update security settings';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }

    if (!this.securitySettings) return;

    this.savingSettings = true;
    this.errorMessage = '';

    const updatedSettings = {
      ...this.securitySettings,
      [key]: !this.securitySettings[key],
    };

    this.settingsService
      .updateSecuritySettings(updatedSettings)
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
        },
      });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  // ADD these helper methods (before markFormGroupTouched)
  getUsagePercent(
    resource:
      | 'members'
      | 'branches'
      | 'users'
      | 'forms'
      | 'events'
      | 'ministries',
  ): number {
    return this.subscriptionService.getUsagePercent(resource);
  }

  getLimitLabel(
    resource:
      | 'members'
      | 'branches'
      | 'users'
      | 'forms'
      | 'events'
      | 'ministries',
  ): string {
    return this.subscriptionService.getLimitLabel(resource);
  }

  getPlanBadgeColor(tier: string): string {
    switch (tier) {
      case 'pro':
        return '#5B21B6';
      case 'growth':
        return '#0369A1';
      default:
        return '#6B7280';
    }
  }

  openUpgradeModal(): void {
    this.upgradeModalTrigger =
      'Upgrade your plan to unlock more features and higher limits.';
    this.showUpgradeModal = true;
  }

  getDaysUntilExpiry(): number | null {
    if (!this.subscriptionStatus?.expires_at) return null;
    const expiry = new Date(this.subscriptionStatus.expires_at);
    const today = new Date();
    const diff = Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff;
  }

  getErrorMessage(
    fieldName: string,
    formType: 'church' | 'member' = 'member',
  ): string {
    const form = formType === 'church' ? this.churchForm : this.memberForm;
    const control = form.get(fieldName);

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
      if (fieldName.includes('phone')) {
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
    const firstError = document.querySelector('.error-message');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.scrollToTop();
    }
  }
}
