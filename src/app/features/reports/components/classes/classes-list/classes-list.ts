import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass, DEFAULT_CLASSES, TERMS, generateAcademicYears, currentAcademicYear } from '../../../../../models/school.model';

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
  showSeedStyleModal = false; // NEW: choose naming style
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

  // NEW: naming style for seed
  seedNamingStyle: 'primary' | 'grade' = 'primary';

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    this.academicYears = generateAcademicYears();
    this.selectedYear = currentAcademicYear();
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

  // ── Create ──────────────────────────────────────────────

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

  // ── Edit ────────────────────────────────────────────────

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

  // ── Delete ──────────────────────────────────────────────

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

  // ── Seed default classes ─────────────────────────────────

  openSeedModal(): void {
    // Show the style picker first
    this.showSeedStyleModal = true;
  }

  closeSeedStyleModal(): void {
    this.showSeedStyleModal = false;
  }

  confirmSeedStyle(): void {
    this.showSeedStyleModal = false;
    this.showSeedModal = true;
  }

  closeSeedModal(): void {
    this.showSeedModal = false;
  }

  // Return the classes that will be created based on selected style
  get seedClassesPreview(): { name: string; level_order: number }[] {
    return this.getDefaultClassesForStyle(this.seedNamingStyle);
  }

  private getDefaultClassesForStyle(style: 'primary' | 'grade'): { name: string; level_order: number }[] {
    if (style === 'grade') {
      return [
        { name: 'Nursery', level_order: 1 },
        { name: 'Kindergarten 1', level_order: 2 },
        { name: 'Kindergarten 2', level_order: 3 },
        { name: 'Grade 1', level_order: 4 },
        { name: 'Grade 2', level_order: 5 },
        { name: 'Grade 3', level_order: 6 },
        { name: 'Grade 4', level_order: 7 },
        { name: 'Grade 5', level_order: 8 },
        { name: 'Grade 6', level_order: 9 },
        { name: 'Grade 7', level_order: 10 },
        { name: 'Grade 8', level_order: 11 },
        { name: 'Grade 9', level_order: 12 },
      ];
    }
    // Default: Ghana-style (Primary / JHS)
    return [
      { name: 'Nursery', level_order: 1 },
      { name: 'KG 1', level_order: 2 },
      { name: 'KG 2', level_order: 3 },
      { name: 'KG 3', level_order: 4 },
      { name: 'Primary 1', level_order: 5 },
      { name: 'Primary 2', level_order: 6 },
      { name: 'Primary 3', level_order: 7 },
      { name: 'Primary 4', level_order: 8 },
      { name: 'Primary 5', level_order: 9 },
      { name: 'Primary 6', level_order: 10 },
      { name: 'JHS 1', level_order: 11 },
      { name: 'JHS 2', level_order: 12 },
      { name: 'JHS 3', level_order: 13 },
    ];
  }

  seedDefaultClasses(): void {
    this.processing = true;
    this.errorMessage = '';

    const classesToCreate = this.getDefaultClassesForStyle(this.seedNamingStyle);

    const creates = classesToCreate.map((cls) =>
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

  // ── Navigation ───────────────────────────────────────────

  viewStudents(classId: string): void {
    // Pass classId as query param so students-list can filter
    this.router.navigate(['main/reports/students'], {
      queryParams: { classId },
    });
  }

  // NEW: Navigate to add-student with classId pre-selected
  addStudentToClass(classId: string): void {
    this.router.navigate(['main/reports/students/add'], {
      queryParams: { classId },
    });
  }

  getStudentCount(classId: string): number {
    // Will be populated after we add a studentCounts map
    return this.studentCounts.get(classId) ?? 0;
  }

  studentCounts: Map<string, number> = new Map();

  loadStudentCounts(): void {
    this.schoolService
      .getStudentCountsByClass(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (counts) => {
          this.studentCounts = new Map(Object.entries(counts));
        },
        error: () => { /* non-critical — counts just show 0 */ },
      });
  }
}
