
// src/app/features/sermons/components/create-sermon/create-sermon.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SermonsService } from '../../services/sermons';
import {SermonSeries } from '../../../../models/sermon.model';

@Component({
  selector: 'app-create-sermon',
  standalone: false,
  templateUrl: './create-sermon.html',
  styleUrl: './create-sermon.scss',
})
export class CreateSermon implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sermonForm!: FormGroup;
  sermonSeries: SermonSeries[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private sermonsService: SermonsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadSermonSeries();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.sermonForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      preacher_name: ['', [Validators.required]],
      sermon_date: ['', [Validators.required]],
      series_name: [''],
      scripture_reference: [''],
      audio_url: [''],
      video_url: [''],
      notes_url: [''],
      thumbnail_url: [''],
      duration: [null],
      tags: ['']
    });
  }

  private loadSermonSeries(): void {
    this.sermonsService.getSermonSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => {
          this.sermonSeries = series;
        },
        error: (error) => {
          console.error('Error loading series:', error);
        }
      });
  }

  onSubmit(): void {
    if (this.sermonForm.invalid) {
      this.markFormGroupTouched(this.sermonForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const formData = {
      ...this.sermonForm.value,
      tags: this.sermonForm.value.tags
        ? this.sermonForm.value.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : []
    };

    this.sermonsService.createSermon(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Sermon uploaded successfully!';
          setTimeout(() => {
            this.router.navigate(['/sermon']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to upload sermon. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/sermon']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.sermonForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
