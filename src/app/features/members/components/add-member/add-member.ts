// src/app/features/members/components/add-member/add-member.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { MemberCreateInput } from '../../../../models/member.model';

@Component({
  selector: 'app-add-member',
  standalone: false,
  templateUrl: './add-member.html',
  styleUrl: './add-member.scss',
})
export class AddMember implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  memberForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Photo upload
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;
  uploadingPhoto = false;

  // Options
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

  educationLevels = [
    'Primary',
    'Secondary',
    'Diploma',
    'Bachelors',
    'Masters',
    'PhD',
    'Other',
  ];

  // Permissions
  canAddMember = false;

  constructor(
    private fb: FormBuilder,
    private memberService: MemberService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const adminRoles = ['super_admin', 'church_admin', 'pastor'];
    this.canAddMember = this.authService.hasRole(adminRoles);

    if (!this.canAddMember) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.memberForm = this.fb.group({
      first_name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
        ],
      ],
      middle_name: ['', [Validators.maxLength(50)]],
      last_name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
        ],
      ],
      date_of_birth: [''],
      gender: [''],
      marital_status: [''],
      phone_primary: ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      phone_secondary: ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      email: ['', [Validators.email]],
      address: ['', [Validators.maxLength(200)]],
      city: ['', [Validators.maxLength(100)]],
      occupation: ['', [Validators.maxLength(100)]],
      employer: ['', [Validators.maxLength(100)]],
      education_level: [''],
      emergency_contact_name: ['', [Validators.maxLength(100)]],
      emergency_contact_phone: ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      emergency_contact_relationship: ['', [Validators.maxLength(50)]],
      baptism_date: [''],
      baptism_location: ['', [Validators.maxLength(100)]],
      join_date: [today, [Validators.required]],
      is_new_convert: [false],
      is_visitor: [false],
      notes: ['', [Validators.maxLength(500)]],
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Please select a valid image file (JPEG, PNG, GIF)';
        setTimeout(() => (this.errorMessage = ''), 3000);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Image size must be less than 5MB';
        setTimeout(() => (this.errorMessage = ''), 3000);
        return;
      }

      this.selectedPhoto = file;
      this.errorMessage = '';

      const reader = new FileReader();
      reader.onload = (e) => {
        this.photoPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto(): void {
    this.selectedPhoto = null;
    this.photoPreview = null;
  }

  onSubmit(): void {
    if (this.memberForm.invalid) {
      this.markFormGroupTouched(this.memberForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToFirstError();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const memberData = this.prepareMemberData();

    this.memberService
      .createMember(memberData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          if (this.selectedPhoto) {
            this.uploadPhoto(member.id);
          } else {
            this.showSuccessAndRedirect(member.id);
          }
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage =
            error.message || 'Failed to create member. Please try again.';
          this.scrollToTop();
        },
      });
  }

  private prepareMemberData(): MemberCreateInput {
    const formValue = this.memberForm.value;

    const memberData: MemberCreateInput = {
      first_name: formValue.first_name,
      last_name: formValue.last_name,
      join_date: formValue.join_date,
      is_new_convert: formValue.is_new_convert || false,
      is_visitor: formValue.is_visitor || false,
    };

    // Add optional fields only if they have values
    if (formValue.middle_name) memberData.middle_name = formValue.middle_name;
    if (formValue.date_of_birth)
      memberData.date_of_birth = formValue.date_of_birth;
    if (formValue.gender) memberData.gender = formValue.gender;
    if (formValue.marital_status)
      memberData.marital_status = formValue.marital_status;
    if (formValue.phone_primary)
      memberData.phone_primary = formValue.phone_primary;
    if (formValue.phone_secondary)
      memberData.phone_secondary = formValue.phone_secondary;
    if (formValue.email) memberData.email = formValue.email;
    if (formValue.address) memberData.address = formValue.address;
    if (formValue.city) memberData.city = formValue.city;
    if (formValue.occupation) memberData.occupation = formValue.occupation;
    if (formValue.employer) memberData.employer = formValue.employer;
    if (formValue.education_level)
      memberData.education_level = formValue.education_level;
    if (formValue.emergency_contact_name)
      memberData.emergency_contact_name = formValue.emergency_contact_name;
    if (formValue.emergency_contact_phone)
      memberData.emergency_contact_phone = formValue.emergency_contact_phone;
    if (formValue.emergency_contact_relationship)
      memberData.emergency_contact_relationship =
        formValue.emergency_contact_relationship;
    if (formValue.baptism_date)
      memberData.baptism_date = formValue.baptism_date;
    if (formValue.baptism_location)
      memberData.baptism_location = formValue.baptism_location;
    if (formValue.notes) memberData.notes = formValue.notes;

    return memberData;
  }

  private uploadPhoto(memberId: string): void {
    if (!this.selectedPhoto) return;

    this.uploadingPhoto = true;

    this.memberService
      .uploadMemberPhoto(memberId, this.selectedPhoto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (photoUrl) => {
          this.memberService
            .updateMember(memberId, { photo_url: photoUrl })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.uploadingPhoto = false;
                this.showSuccessAndRedirect(memberId);
              },
              error: (error) => {
                console.error('Error updating photo URL:', error);
                this.uploadingPhoto = false;
                this.showSuccessAndRedirect(memberId);
              },
            });
        },
        error: (error) => {
          console.error('Error uploading photo:', error);
          this.uploadingPhoto = false;
          this.showSuccessAndRedirect(memberId);
        },
      });
  }

  private showSuccessAndRedirect(memberId: string): void {
    this.loading = false;
    this.successMessage = 'Member added successfully!';
    this.scrollToTop();

    setTimeout(() => {
      this.router.navigate(['main/members', memberId]);
    }, 1500);
  }

  cancel(): void {
    if (this.memberForm.dirty) {
      if (
        confirm('You have unsaved changes. Are you sure you want to leave?')
      ) {
        this.router.navigate(['main/members']);
      }
    } else {
      this.router.navigate(['main/members']);
    }
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

  getErrorMessage(fieldName: string): string {
    const control = this.memberForm.get(fieldName);

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
        return 'Please enter a valid 10-digit phone number (e.g., 0201234567)';
      }
      return 'Invalid format';
    }
    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scrollToFirstError(): void {
    const firstError = document.querySelector('.error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  get today(): string {
    return new Date().toISOString().split('T')[0];
  }
}
