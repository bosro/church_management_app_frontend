// src/app/features/members/components/add-member/add-member.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { MemberCreateInput, CellGroup } from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { SubscriptionService } from '../../../../core/services/subscription.service';

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

  // Cell groups
  cellGroups: CellGroup[] = [];
  loadingCellGroups = false;

  // Cell leader state
  isCellLeader = false;
  cellLeaderGroupId: string | null = null;
  cellLeaderGroupName: string | null = null;

  // Permissions
  canAddMember = false;
  showUpgradeModal = false;
  upgradeModalTrigger = '';

  constructor(
    private fb: FormBuilder,
    private memberService: MemberService,
    private authService: AuthService,
    private router: Router,
    public permissionService: PermissionService,
    private subscriptionService: SubscriptionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCellGroups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    // Roles that can add members even without an explicit permission grant
    const allowedRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'group_leader',
      'cell_leader',
    ];

    this.canAddMember =
      this.permissionService.isAdmin ||
      this.permissionService.members.create ||
      allowedRoles.includes(role);

    if (!this.canAddMember) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadCellGroups(): void {
    this.loadingCellGroups = true;
    const role = this.authService.getCurrentUserRole();
    this.isCellLeader = role === 'cell_leader';

    this.memberService
      .getCellGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.cellGroups = groups;
          this.loadingCellGroups = false;

          // Auto-assign cell leader to their own group and lock the field
          if (this.isCellLeader) {
            const userId = this.authService.getUserId();
            const myGroup = groups.find((g) => g.leader_id === userId);
            if (myGroup) {
              this.cellLeaderGroupId = myGroup.id;
              this.cellLeaderGroupName = myGroup.name;
              this.memberForm.get('cell_group_id')?.setValue(myGroup.id);
              this.memberForm.get('cell_group_id')?.disable();
            }
          }
        },
        error: () => {
          this.loadingCellGroups = false;
        },
      });
  }

  handleError(error: any): void {
    if (error.message?.startsWith('QUOTA_EXCEEDED:')) {
      const parts = error.message.split(':');
      const limit = parts[3];
      this.upgradeModalTrigger =
        `You've reached the ${limit} member limit on your current plan. ` +
        `Upgrade to add more members.`;
      this.showUpgradeModal = true;
    } else {
      this.errorMessage = error.message || 'An error occurred';
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
      cell_group_id: [''],
      notes: ['', [Validators.maxLength(500)]],
      spouse_name: ['', [Validators.maxLength(100)]],
      children_names: ['', [Validators.maxLength(300)]],
      father_name: ['', [Validators.maxLength(100)]],
      mother_name: ['', [Validators.maxLength(100)]],
      parents_alive_status: [''],
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
        error: (err) => {
          this.loading = false;
          this.handleError(err);
        },
      });
  }

  private prepareMemberData(): MemberCreateInput {
    // getRawValue() includes disabled controls (cell_group_id when locked)
    const formValue = this.memberForm.getRawValue();

    const memberData: MemberCreateInput = {
      first_name: formValue.first_name,
      last_name: formValue.last_name,
      join_date: formValue.join_date,
      is_new_convert: formValue.is_new_convert || false,
      is_visitor: formValue.is_visitor || false,
    };

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
    if (formValue.cell_group_id)
      memberData.cell_group_id = formValue.cell_group_id;
    if (formValue.spouse_name) memberData.spouse_name = formValue.spouse_name;
    if (formValue.children_names)
      memberData.children_names = formValue.children_names;
    if (formValue.father_name) memberData.father_name = formValue.father_name;
    if (formValue.mother_name) memberData.mother_name = formValue.mother_name;
    if (formValue.parents_alive_status)
      memberData.parents_alive_status = formValue.parents_alive_status;

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
              error: () => {
                this.uploadingPhoto = false;
                this.showSuccessAndRedirect(memberId);
              },
            });
        },
        error: () => {
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
      if (control instanceof FormGroup) this.markFormGroupTouched(control);
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.memberForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('email')) return 'Please enter a valid email address';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters allowed`;
    if (control.hasError('pattern') && fieldName.includes('phone'))
      return 'Please enter a valid 10-digit phone number (e.g., 0201234567)';
    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scrollToFirstError(): void {
    const firstError = document.querySelector('.error-message');
    if (firstError)
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}
