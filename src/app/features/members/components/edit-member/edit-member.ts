

// src/app/features/members/components/edit-member/edit-member.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { Member } from '../../../../models/member.model';

@Component({
  selector: 'app-edit-member',
  standalone: false,
  templateUrl: './edit-member.html',
  styleUrl: './edit-member.scss',
})
export class EditMember implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  memberId: string = '';
  memberForm!: FormGroup;
  loading = false;
  loadingMember = true;
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
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.memberId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.memberId) {
      this.loadMember();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.memberForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      marital_status: [''],
      phone_primary: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      phone_secondary: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      email: ['', [Validators.email]],
      address: [''],
      city: [''],
      occupation: [''],
      employer: [''],
      education_level: [''],
      emergency_contact_name: [''],
      emergency_contact_phone: ['', [Validators.pattern(/^[0-9]{10,15}$/)]],
      emergency_contact_relationship: [''],
      baptism_date: [''],
      baptism_location: [''],
      join_date: ['', [Validators.required]],
      is_new_convert: [false],
      is_visitor: [false],
      notes: ['']
    });
  }

  private loadMember(): void {
    this.loadingMember = true;

    this.memberService.getMemberById(this.memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          this.populateForm(member);
          if (member.photo_url) {
            this.photoPreview = member.photo_url;
          }
          this.loadingMember = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load member';
          this.loadingMember = false;
        }
      });
  }

  private populateForm(member: Member): void {
    this.memberForm.patchValue({
      first_name: member.first_name,
      middle_name: member.middle_name,
      last_name: member.last_name,
      date_of_birth: member.date_of_birth,
      gender: member.gender,
      marital_status: member.marital_status,
      phone_primary: member.phone_primary,
      phone_secondary: member.phone_secondary,
      email: member.email,
      address: member.address,
      city: member.city,
      occupation: member.occupation,
      employer: member.employer,
      education_level: member.education_level,
      emergency_contact_name: member.emergency_contact_name,
      emergency_contact_phone: member.emergency_contact_phone,
      emergency_contact_relationship: member.emergency_contact_relationship,
      baptism_date: member.baptism_date,
      baptism_location: member.baptism_location,
      join_date: member.join_date,
      is_new_convert: member.is_new_convert,
      is_visitor: member.is_visitor,
      notes: member.notes
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Please select a valid image file';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Image size must be less than 5MB';
        return;
      }

      this.selectedPhoto = file;

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

    this.memberService.updateMember(this.memberId, memberData)
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
          this.errorMessage = error.message || 'Failed to update member. Please try again.';
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
    this.successMessage = 'Member updated successfully!';
    setTimeout(() => {
      this.router.navigate(['main/members', memberId]);
    }, 1500);
  }

  cancel(): void {
    this.router.navigate(['main/members', this.memberId]);
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
