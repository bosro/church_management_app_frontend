
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Student, SchoolClass } from '../../../../../models/school.model';

@Component({
  selector: 'app-students-list',
  standalone: false,
  templateUrl: './students-list.html',
  styleUrl: './students-list.scss',
})
export class StudentsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  students: Student[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalStudents = 0;
  totalPages = 0;

  // Filters
  filterForm!: FormGroup;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.initFilterForm();
    this.loadClasses();
    this.loadStudents();
    this.setupFilterListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      search: [''],
      classId: [''],
      isActive: ['true'],
    });
  }

  private setupFilterListener(): void {
    this.filterForm.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadStudents();
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

  loadStudents(): void {
    this.loading = true;
    this.errorMessage = '';

    const values = this.filterForm.value;
    const filters = {
      search: values.search || undefined,
      classId: values.classId || undefined,
      isActive: values.isActive === 'true' ? true
              : values.isActive === 'false' ? false
              : undefined,
    };

    this.schoolService
      .getStudents(filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.students = data;
          this.totalStudents = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load students';
          this.loading = false;
        },
      });
  }

  // Navigation
  addStudent(): void {
    this.router.navigate(['main/reports/students/add']);
  }

  viewStudent(id: string): void {
    this.router.navigate(['main/reports/students', id]);
  }

  editStudent(id: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/reports/students', id, 'edit']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadStudents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadStudents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ search: '', classId: '', isActive: 'true' });
  }

  getFullName(student: Student): string {
    return `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim();
  }

  getInitials(student: Student): string {
    return `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();
  }
}
