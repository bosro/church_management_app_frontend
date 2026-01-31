import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {

}
// src/app/features/settings/components/settings/settings.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: string = 'general';
  churchProfile: any = null;
  churchForm!: FormGroup;

  loading = false;
  loadingProfile = true;
  errorMessage = '';
  successMessage = '';

  // Setting Categories
  categories = {
    general: 'General Settings',
    notifications: 'Notifications',
    finance: 'Finance Settings',
    communications: 'Communications',
    security: 'Security'
  };

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadChurchProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.churchForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      address: [''],
      city: [''],
      state: [''],
      country: [''],
      zip_code: [''],
      website: [''],
      logo_url: [''],
      timezone: [''],
      currency: ['GHS'],
      description: ['']
    });
  }

  private loadChurchProfile(): void {
    this.loadingProfile = true;

    this.settingsService.getChurchProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.churchProfile = profile;
          this.populateForm(profile);
          this.loadingProfile = false;
        },
        error: (error) => {
          console.error('Error loading church profile:', error);
          this.loadingProfile = false;
        }
      });
  }

  private populateForm(profile: any): void {
    this.churchForm.patchValue({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      zip_code: profile.zip_code,
      website: profile.website,
      logo_url: profile.logo_url,
      timezone: profile.timezone,
      currency: profile.currency,
      description: profile.description
    });
  }

  // Tab Navigation
  switchTab(tab: string): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // Form Submission
  onSubmit(): void {
    if (this.churchForm.invalid) {
      this.markFormGroupTouched(this.churchForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.settingsService.updateChurchProfile(this.churchForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Church profile updated successfully!';
          this.loading = false;
          this.loadChurchProfile();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update profile. Please try again.';
        }
      });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.churchForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Invalid email address';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
