
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass, DEFAULT_CLASSES, TERMS } from '../../../../../models/school.model';

@Component({
  selector: 'app-classes-list',
  standalone: false,
  templateUrl: './classes-list.html',
  styleUrl: './classes-list.scss',
})
export class ClassesList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Modal state
  showCreateModal = false;
  showEditModal = false;
  showSeedModal = false;
  selectedClass: SchoolClass | null = null;
  processing = false;

  // Form data
  classForm = {
    name: '',
    level_order: 1,
    academic_year: '',
    class_teacher: '',
  };

  currentAcademicYear = '';
  academicYears: string[] = [];
  selectedYear = '';
  defaultClasses = DEFAULT_CLASSES;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    const year = new Date().getFullYear();
    this.currentAcademicYear = `${year}/${year + 1}`;
    this.selectedYear = this.currentAcademicYear;
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
      `${year - 2}/${year - 1}`,
    ];
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getClasses(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (classes) => {
          this.classes = classes;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load classes';
          this.loading = false;
        },
      });
  }

  onYearChange(): void {
    this.loadClasses();
  }

  // Create
  openCreateModal(): void {
    this.classForm = {
      name: '',
      level_order: this.classes.length + 1,
      academic_year: this.selectedYear,
      class_teacher: '',
    };
    this.showCreateModal = true;
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createClass(): void {
    if (!this.classForm.name.trim()) {
      this.errorMessage = 'Class name is required';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    this.schoolService
      .createClass(this.classForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Class created successfully!';
          this.processing = false;
          this.closeCreateModal();
          this.loadClasses();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to create class';
          this.processing = false;
        },
      });
  }

  // Edit
  openEditModal(cls: SchoolClass): void {
    this.selectedClass = cls;
    this.classForm = {
      name: cls.name,
      level_order: cls.level_order,
      academic_year: cls.academic_year,
      class_teacher: cls.class_teacher || '',
    };
    this.showEditModal = true;
    this.errorMessage = '';
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedClass = null;
  }

  updateClass(): void {
    if (!this.selectedClass) return;

    this.processing = true;
    this.errorMessage = '';

    this.schoolService
      .updateClass(this.selectedClass.id, this.classForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Class updated successfully!';
          this.processing = false;
          this.closeEditModal();
          this.loadClasses();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to update class';
          this.processing = false;
        },
      });
  }

  // Delete
  deleteClass(cls: SchoolClass): void {
    if (!confirm(`Are you sure you want to deactivate "${cls.name}"?`)) return;

    this.schoolService
      .deleteClass(cls.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Class deactivated successfully!';
          this.loadClasses();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to deactivate class';
        },
      });
  }

  // Seed default classes
  openSeedModal(): void {
    this.showSeedModal = true;
  }

  closeSeedModal(): void {
    this.showSeedModal = false;
  }

  seedDefaultClasses(): void {
    this.processing = true;
    this.errorMessage = '';

    const creates = this.defaultClasses.map((cls) =>
      this.schoolService
        .createClass({
          name: cls.name,
          level_order: cls.level_order,
          academic_year: this.selectedYear,
        })
        .toPromise()
        .catch(() => null),
    );

    Promise.allSettled(creates).then(() => {
      this.successMessage = 'Default classes created!';
      this.processing = false;
      this.closeSeedModal();
      this.loadClasses();
      setTimeout(() => (this.successMessage = ''), 3000);
    });
  }

  viewStudents(classId: string): void {
    this.router.navigate(['main/reports/students'], {
      queryParams: { classId },
    });
  }
}
