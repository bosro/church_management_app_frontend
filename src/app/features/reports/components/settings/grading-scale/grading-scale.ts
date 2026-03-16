
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { GradingScale } from '../../../../../models/school.model';

@Component({
  selector: 'app-grading-scale',
  standalone: false,
  templateUrl: './grading-scale.html',
  styleUrl: './grading-scale.scss',
})
export class GradingScaleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  scales: GradingScale[] = [];
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';
  hasScale = false;

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
    this.loadScale();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadScale(): void {
    this.loading = true;
    this.schoolService
      .getGradingScale()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (scales) => {
          this.scales = scales;
          this.hasScale = scales.length > 0;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  initializeDefault(): void {
    this.saving = true;
    this.schoolService
      .initializeGradingScale()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Default grading scale created!';
          this.saving = false;
          this.loadScale();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.saving = false;
        },
      });
  }

  saveScale(): void {
    // Validate no overlaps and full coverage
    for (let i = 0; i < this.scales.length; i++) {
      if (this.scales[i].min_score >= this.scales[i].max_score) {
        this.errorMessage = `Grade ${this.scales[i].grade}: Min score must be less than max score`;
        return;
      }
    }

    this.saving = true;
    this.errorMessage = '';

    this.schoolService
      .updateGradingScale(this.scales)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Grading scale saved successfully!';
          this.saving = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to save';
          this.saving = false;
        },
      });
  }

  addGrade(): void {
    this.scales.push({
      id: '',
      church_id: '',
      grade: '',
      min_score: 0,
      max_score: 0,
      label: '',
    });
  }

  removeGrade(index: number): void {
    this.scales.splice(index, 1);
  }
}
