
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Student, SchoolClass } from '../../../../../models/school.model';

@Component({
  selector: 'app-edit-student',
  standalone: false,
  templateUrl: './edit-student.html',
  styleUrl: './edit-student.scss',
})
export class EditStudent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  student: Student | null = null;
  studentForm!: FormGroup;
  classes: SchoolClass[] = [];
  loading = false;
  loadingStudent = true;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.school.manage) {
      this.router.navigate(['/unauthorized']);
      return;
    }
    this.studentId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    this.loadClasses();
    if (this.studentId) this.loadStudent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
      is_active: [true],
    });
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadStudent(): void {
    this.schoolService
      .getStudentById(this.studentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (student) => {
          this.student = student;
          this.studentForm.patchValue({
            first_name: student.first_name,
            middle_name: student.middle_name || '',
            last_name: student.last_name,
            date_of_birth: student.date_of_birth || '',
            gender: student.gender || '',
            class_id: student.class_id || '',
            parent_name: student.parent_name || '',
            parent_phone: student.parent_phone || '',
            parent_email: student.parent_email || '',
            address: student.address || '',
            is_active: student.is_active,
          });
          this.loadingStudent = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load student';
          this.loadingStudent = false;
        },
      });
  }

  onSubmit(): void {
  if (this.studentForm.invalid) {
    Object.values(this.studentForm.controls).forEach((c) => c.markAsTouched());
    this.errorMessage = 'Please fill in all required fields';
    return;
  }

  this.loading = true;
  this.errorMessage = '';

  const formValue = this.sanitizeFormValue(this.studentForm.value); // ← sanitize

  this.schoolService
    .updateStudent(this.studentId, formValue)  // ← use formValue
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (student) => {
        this.successMessage = 'Student updated successfully!';
        this.loading = false;
        setTimeout(() => {
          this.router.navigate(['main/reports/students', student.id]);
        }, 1500);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to update student';
        this.loading = false;
      },
    });
}

// Same helper — add to edit-student class too
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
    this.router.navigate(['main/reports/students', this.studentId]);
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


