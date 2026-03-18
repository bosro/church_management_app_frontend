
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  Subject as SchoolSubject, SchoolClass
} from '../../../../../models/school.model';

@Component({
  selector: 'app-subjects-list',
  standalone: false,
  templateUrl: './subjects-list.html',
  styleUrl: './subjects-list.scss',
})
export class SubjectsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  subjects: SchoolSubject[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  selectedClassId = '';

  showModal = false;
  editingSubject: SchoolSubject | null = null;
  processing = false;

  subjectForm = {
    name: '',
    class_id: '',
    teacher_name: '',
  };

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.isAdmin) {
      this.router.navigate(['/unauthorized']);
      return;
    }
    this.loadClasses();
    this.loadSubjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService.getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadSubjects(): void {
    this.loading = true;
    this.schoolService
      .getSubjects(this.selectedClassId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subjects) => {
          this.subjects = subjects;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  onClassFilterChange(): void {
    this.loadSubjects();
  }

  // Group subjects by class
  get groupedSubjects(): { class: SchoolClass; subjects: SchoolSubject[] }[] {
    const map: { [key: string]: SchoolSubject[] } = {};
    this.subjects.forEach((s) => {
      if (!map[s.class_id]) map[s.class_id] = [];
      map[s.class_id].push(s);
    });

    return Object.keys(map).map((classId) => ({
      class: map[classId][0].class || ({ name: 'Unknown' } as SchoolClass),
      subjects: map[classId],
    }));
  }

  openCreateModal(): void {
    this.editingSubject = null;
    this.subjectForm = {
      name: '',
      class_id: this.selectedClassId || '',
      teacher_name: '',
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  openEditModal(subject: SchoolSubject): void {
    this.editingSubject = subject;
    this.subjectForm = {
      name: subject.name,
      class_id: subject.class_id,
      teacher_name: subject.teacher_name || '',
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  closeModal(): void {
    this.showModal = false;
    this.editingSubject = null;
  }

  saveSubject(): void {
    if (!this.subjectForm.name || !this.subjectForm.class_id) {
      this.errorMessage = 'Subject name and class are required';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    const obs = this.editingSubject
      ? this.schoolService.updateSubject(this.editingSubject.id, this.subjectForm)
      : this.schoolService.createSubject(this.subjectForm);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = this.editingSubject
          ? 'Subject updated!' : 'Subject created!';
        this.processing = false;
        this.closeModal();
        this.loadSubjects();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to save subject';
        this.processing = false;
      },
    });
  }

  deleteSubject(subject: SchoolSubject): void {
    if (!confirm(`Delete subject "${subject.name}"?`)) return;

    this.schoolService
      .deleteSubject(subject.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Subject deleted!';
          this.loadSubjects();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
        },
      });
  }
}
