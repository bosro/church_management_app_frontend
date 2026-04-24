import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass } from '../../../../../models/school.model';
import { SupabaseService } from '../../../../../core/services/supabase';
import { AuthService } from '../../../../../core/services/auth';

@Component({
  selector: 'app-add-student',
  standalone: false,
  templateUrl: './add-student.html',
  styleUrl: './add-student.scss',
})
export class AddStudent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentForm!: FormGroup;
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pre-selected class from query param (set by class card "Add Student" button)
  preSelectedClassId = '';
  preSelectedClassName = '';

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadClasses();

    // Read classId from query params if navigated from class card
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['classId']) {
          this.preSelectedClassId = params['classId'];
          this.studentForm.patchValue({ class_id: params['classId'] });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    if (!this.permissionService.school?.manage) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.studentForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: [''],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      date_of_birth: [''],
      gender: [''],
      class_id: ['', Validators.required],
      parent_name: [''],
      parent_phone: [''],
      parent_email: ['', Validators.email],
      address: [''],
    });
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (classes) => {
          this.classes = classes;
          // Resolve name after classes load
          if (this.preSelectedClassId) {
            const found = classes.find((c) => c.id === this.preSelectedClassId);
            this.preSelectedClassName = found?.name || '';
          }
        },
        error: (err) => console.error(err),
      });
  }

  onSubmit(): void {
    if (this.studentForm.invalid) {
      this.markAllTouched();
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formValue = this.sanitizeFormValue(this.studentForm.value);

    // Use the service method instead of calling RPC directly
    this.schoolService
      .createStudent(formValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (student) => {
          this.loading = false;
          this.successMessage = `Student ${student.first_name} ${student.last_name} added successfully!`;

          const targetClassId = this.preSelectedClassId || formValue.class_id;
          setTimeout(() => {
            if (targetClassId) {
              this.router.navigate(['main/reports/students'], {
                queryParams: { classId: targetClassId },
              });
            } else {
              this.router.navigate(['main/reports/students', student.id]);
            }
          }, 1500);
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.message || 'Failed to add student';
        },
      });
  }

  private sanitizeFormValue(value: any): any {
    return {
      ...value,
      date_of_birth: value.date_of_birth?.trim() || null,
      middle_name: value.middle_name?.trim() || null,
      parent_name: value.parent_name?.trim() || null,
      parent_phone: value.parent_phone?.trim() || null,
      parent_email: value.parent_email?.trim() || null,
      address: value.address?.trim() || null,
      gender: value.gender || null,
    };
  }

  cancel(): void {
    if (this.studentForm.dirty) {
      if (confirm('You have unsaved changes. Leave?')) {
        this.goBack();
      }
    } else {
      this.goBack();
    }
  }

  private goBack(): void {
    if (this.preSelectedClassId) {
      this.router.navigate(['main/reports/students'], {
        queryParams: { classId: this.preSelectedClassId },
      });
    } else {
      this.router.navigate(['main/reports/students']);
    }
  }

  private markAllTouched(): void {
    Object.values(this.studentForm.controls).forEach((c) => c.markAsTouched());
  }

  getError(field: string): string {
    const control = this.studentForm.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('email')) return 'Invalid email address';
    return 'Invalid input';
  }
}


