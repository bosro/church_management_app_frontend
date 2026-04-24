import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';
import { Member, CellGroup } from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';

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

  selectedPhoto: File | null = null;
  photoPreview: string | null = null;
  uploadingPhoto = false;
  originalPhotoUrl: string | null = null;

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

  cellGroups: CellGroup[] = [];
  loadingCellGroups = false;

  memberCurrentCellGroupId: string | null = null;

  isCellLeader = false;
  // All cell groups this cell leader leads (a leader can lead multiple)
  cellLeaderGroupIds: string[] = [];
  cellLeaderGroupNames: string[] = [];

  canEditMember = false;

  constructor(
    private fb: FormBuilder,
    private memberService: MemberService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.memberId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.memberId) {
      this.router.navigate(['main/members']);
      return;
    }
    this.initForm();
    this.loadCellGroupsThenMember();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const editRoles = ['pastor', 'senior_pastor', 'associate_pastor'];
    this.canEditMember =
      this.permissionService.isAdmin ||
      this.permissionService.members.edit ||
      editRoles.includes(role);
    if (!this.canEditMember) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadCellGroupsThenMember(): void {
    this.loadingCellGroups = true;
    const role = this.authService.getCurrentUserRole();
    this.isCellLeader = role === 'cell_leader';

    this.memberService
      .getCellGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          if (this.isCellLeader) {
            const userId = this.authService.getUserId();
            const myGroups = groups.filter((g) => g.leader_id === userId);
            this.cellLeaderGroupIds = myGroups.map((g) => g.id);
            this.cellLeaderGroupNames = myGroups.map((g) => g.name);
            this.cellGroups = myGroups;
          } else {
            this.cellGroups = groups;
          }
          this.loadingCellGroups = false;
          this.loadMember();
        },
        error: () => {
          this.loadingCellGroups = false;
          this.loadMember();
        },
      });
  }

  private initForm(): void {
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
      join_date: ['', [Validators.required]],
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

  private loadMember(): void {
    this.loadingMember = true;
    this.memberService
      .getMemberById(this.memberId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (member) => {
          // Track the member's current cell group before populating form
          this.memberCurrentCellGroupId = member.cell_group_id || null;

          this.populateForm(member);
          if (member.photo_url) {
            this.photoPreview = member.photo_url;
            this.originalPhotoUrl = member.photo_url;
          }
          this.loadingMember = false;

          // Cell leader restriction: only block if member explicitly belongs
          // to a DIFFERENT leader's cell group (not null, not their own)
          if (this.isCellLeader && this.cellLeaderGroupIds.length > 0) {
            const memberInDifferentGroup =
              member.cell_group_id !== null &&
              member.cell_group_id !== undefined &&
              !this.cellLeaderGroupIds.includes(member.cell_group_id);

            if (memberInDifferentGroup) {
              this.errorMessage =
                'You can only edit members in your own cell group.';
              setTimeout(() => this.router.navigate(['main/members']), 2000);
              return;
            }
          }

          // For cell leaders: enable the cell_group_id control so they can
          // assign or unassign members from their own groups
          if (this.isCellLeader) {
            // Do NOT disable — let them pick from their groups or remove
            this.memberForm.get('cell_group_id')?.enable();
          }
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load member details';
          this.loadingMember = false;
        },
      });
  }

  private populateForm(member: Member): void {
    this.memberForm.patchValue({
      first_name: member.first_name || '',
      middle_name: member.middle_name || '',
      last_name: member.last_name || '',
      date_of_birth: member.date_of_birth || '',
      gender: member.gender || '',
      marital_status: member.marital_status || '',
      phone_primary: member.phone_primary || '',
      phone_secondary: member.phone_secondary || '',
      email: member.email || '',
      address: member.address || '',
      city: member.city || '',
      occupation: member.occupation || '',
      employer: member.employer || '',
      education_level: member.education_level || '',
      emergency_contact_name: member.emergency_contact_name || '',
      emergency_contact_phone: member.emergency_contact_phone || '',
      emergency_contact_relationship:
        member.emergency_contact_relationship || '',
      baptism_date: member.baptism_date || '',
      baptism_location: member.baptism_location || '',
      join_date: member.join_date || '',
      is_new_convert: member.is_new_convert || false,
      is_visitor: member.is_visitor || false,
      cell_group_id: member.cell_group_id || '',
      notes: member.notes || '',
      spouse_name: member.spouse_name || '',
      children_names: member.children_names || '',
      father_name: member.father_name || '',
      mother_name: member.mother_name || '',
      parents_alive_status: member.parents_alive_status || '',
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
    this.photoPreview = this.originalPhotoUrl;
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
      .updateMember(this.memberId, memberData)
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
            error.message || 'Failed to update member. Please try again.';
          this.scrollToTop();
        },
      });
  }

  private prepareMemberData(): Partial<Member> {
    const formValue = this.memberForm.getRawValue();
    const memberData: any = {};

    Object.keys(formValue).forEach((key) => {
      const value = formValue[key];
      if (key === 'cell_group_id') {
        // Always send null when empty so Supabase actually clears it
        memberData[key] = value || null;
      } else if (value !== '' && value !== null && value !== undefined) {
        memberData[key] = value;
      }
    });

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
    this.successMessage = 'Member updated successfully!';
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
        this.router.navigate(['main/members', this.memberId]);
      }
    } else {
      this.router.navigate(['main/members', this.memberId]);
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
