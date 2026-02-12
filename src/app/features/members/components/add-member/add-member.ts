
// src/app/features/members/components/add-member/add-member.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { Member } from '../../../../models/member.model';

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
    { value: 'other', label: 'Other' }
  ];

  maritalStatusOptions = [
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'divorced', label: 'Divorced' },
    { value: 'widowed', label: 'Widowed' }
  ];

  educationLevels = [
    'Primary', 'Secondary', 'Diploma', 'Bachelors', 'Masters', 'PhD', 'Other'
  ];

  constructor(
    private fb: FormBuilder,
    private memberService: MemberService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.memberForm = this.fb.group({
      // Basic Information
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      marital_status: [''],

      // Contact Information
      phone_primary: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      phone_secondary: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      email: ['', [Validators.email]],
      address: [''],
      city: [''],

      // Occupation & Education
      occupation: [''],
      employer: [''],
      education_level: [''],

      // Emergency Contact
      emergency_contact_name: [''],
      emergency_contact_phone: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      emergency_contact_relationship: [''],

      // Church Information
      baptism_date: [''],
      baptism_location: [''],
      join_date: [new Date().toISOString().split('T')[0], [Validators.required]],
      is_new_convert: [false],
      is_visitor: [false],
      notes: ['']
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Please select a valid image file';
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Image size must be less than 5MB';
        return;
      }

      this.selectedPhoto = file;

      // Create preview
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
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const memberData = this.memberForm.value;

    this.memberService.createMember(memberData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          // Upload photo if selected
          if (this.selectedPhoto) {
            this.uploadPhoto(member.id);
          } else {
            this.showSuccessAndRedirect(member.id);
          }
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create member. Please try again.';
        }
      });
  }

  private uploadPhoto(memberId: string): void {
    if (!this.selectedPhoto) return;

    this.uploadingPhoto = true;

    this.memberService.uploadMemberPhoto(memberId, this.selectedPhoto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (photoUrl) => {
          // Update member with photo URL
          this.memberService.updateMember(memberId, { photo_url: photoUrl })
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
              }
            });
        },
        error: (error) => {
          console.error('Error uploading photo:', error);
          this.uploadingPhoto = false;
          this.showSuccessAndRedirect(memberId);
        }
      });
  }

  private showSuccessAndRedirect(memberId: string): void {
    this.successMessage = 'Member added successfully!';
    setTimeout(() => {
      this.router.navigate(['main/members', memberId]);
    }, 1500);
  }

  cancel(): void {
    this.router.navigate(['main/members']);
  }

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
    const control = this.memberForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control?.hasError('pattern')) {
      return 'Please enter a valid phone number';
    }
    return '';
  }
}
