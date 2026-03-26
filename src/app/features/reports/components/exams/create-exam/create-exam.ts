import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  SchoolClass,
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../../models/school.model';

@Component({
  selector: 'app-create-exam',
  standalone: false,
  templateUrl: './create-exam.html',
  styleUrl: './create-exam.scss',
})
export class CreateExam implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  examForm!: FormGroup;
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';
  terms = TERMS;
  academicYears: string[] = generateAcademicYears();

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.isAdmin) {
      this.router.navigate(['/unauthorized']);
      return;
    }
    this.initForm();
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.examForm = this.fb.group({
      exam_name: ['', [Validators.required, Validators.minLength(3)]],
      class_id: ['', Validators.required],
      academic_year: [currentAcademicYear(), Validators.required],
      term: [TERMS[0], Validators.required],
      exam_date: [''],
      total_marks: [100, [Validators.required, Validators.min(1)]],
    });
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  onSubmit(): void {
    if (this.examForm.invalid) {
      Object.values(this.examForm.controls).forEach((c) => c.markAsTouched());
      this.errorMessage = 'Please fill in all required fields';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.schoolService
      .createExam(this.examForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (exam) => {
          this.successMessage = 'Exam created successfully!';
          this.loading = false;
          setTimeout(() => {
            this.router.navigate(['main/reports/exams', exam.id, 'results']);
          }, 1500);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to create exam';
          this.loading = false;
        },
      });
  }

  cancel(): void {
    this.router.navigate(['main/reports/exams']);
  }

  getError(field: string): string {
    const control = this.examForm.get(field);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('min')) return 'Must be greater than 0';
    return 'Invalid input';
  }
}
