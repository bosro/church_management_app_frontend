
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
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

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    if (!this.permissionService.school.manage) {
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
        next: (classes) => (this.classes = classes),
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

    const churchId = this.authService.getChurchId() || '';

    // Generate student number then create student
    this.supabase.client
      .rpc('generate_student_number', { p_church_id: churchId })
      .then(({ data: studentNumber, error }) => {
        if (error) {
          this.errorMessage = error.message;
          this.loading = false;
          return;
        }

        this.schoolService
          .createStudentWithNumber(this.studentForm.value, studentNumber)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (student) => {
              this.successMessage = `Student ${student.first_name} ${student.last_name} added successfully!`;
              this.loading = false;
              setTimeout(() => {
                this.router.navigate(['main/reports/students', student.id]);
              }, 1500);
            },
            error: (err) => {
              this.errorMessage = err.message || 'Failed to add student';
              this.loading = false;
            },
          });
      });
  }

  cancel(): void {
    if (this.studentForm.dirty) {
      if (confirm('You have unsaved changes. Leave?')) {
        this.router.navigate(['main/reports/students']);
      }
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





