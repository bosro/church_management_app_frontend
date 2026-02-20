// src/app/features/sermons/components/edit-sermon/edit-sermon.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { SermonsService } from '../../services/sermons';
import { Sermon, SermonSeries } from '../../../../models/sermon.model';

@Component({
  selector: 'app-edit-sermon',
  standalone: false,
  templateUrl: './edit-sermon.html',
  styleUrl: './edit-sermon.scss',
})
export class EditSermon implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sermonId: string = '';
  sermon: Sermon | null = null;
  sermonForm!: FormGroup;
  sermonSeries: SermonSeries[] = [];
  loading = false;
  loadingSermon = true;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canManageSermons = false;

  constructor(
    private fb: FormBuilder,
    private sermonsService: SermonsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.sermonId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    this.loadSermonSeries();

    if (this.sermonId) {
      this.loadSermon();
    } else {
      this.errorMessage = 'Invalid sermon ID';
      this.loadingSermon = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageSermons = this.sermonsService.canManageSermons();

    if (!this.canManageSermons) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.sermonForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: ['', [Validators.maxLength(1000)]],
      preacher_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      sermon_date: ['', [Validators.required]],
      series_name: [''],
      scripture_reference: ['', [Validators.maxLength(200)]],
      audio_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      video_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      notes_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      thumbnail_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      duration: [null, [Validators.min(0), Validators.max(600)]],
      tags: ['']
    });
  }

  private loadSermonSeries(): void {
    this.sermonsService
      .getSermonSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => {
          this.sermonSeries = series;
        },
        error: (error) => {
          console.error('Error loading series:', error);
          // Don't show error to user - series is optional
        }
      });
  }

  private loadSermon(): void {
    this.loadingSermon = true;
    this.errorMessage = '';

    this.sermonsService
      .getSermonById(this.sermonId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loadingSermon = false)
      )
      .subscribe({
        next: (sermon) => {
          this.sermon = sermon;
          this.populateForm(sermon);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load sermon';
          console.error('Error loading sermon:', error);
        }
      });
  }

  private populateForm(sermon: Sermon): void {
    this.sermonForm.patchValue({
      title: sermon.title,
      description: sermon.description || '',
      preacher_name: sermon.preacher_name,
      sermon_date: sermon.sermon_date,
      series_name: sermon.series_name || '',
      scripture_reference: sermon.scripture_reference || '',
      audio_url: sermon.audio_url || '',
      video_url: sermon.video_url || '',
      notes_url: sermon.notes_url || '',
      thumbnail_url: sermon.thumbnail_url || '',
      duration: sermon.duration || null,
      tags: sermon.tags ? sermon.tags.join(', ') : ''
    });
  }

  onSubmit(): void {
    if (this.sermonForm.invalid) {
      this.markFormGroupTouched(this.sermonForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = {
      ...this.sermonForm.value,
      // Convert comma-separated tags to array
      tags: this.sermonForm.value.tags
        ? this.sermonForm.value.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : []
    };

    this.sermonsService
      .updateSermon(this.sermonId, formData)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: () => {
          this.successMessage = 'Sermon updated successfully!';

          setTimeout(() => {
            this.router.navigate(['main/sermon', this.sermonId]);
          }, 1500);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update sermon. Please try again.';
          this.scrollToTop();
          console.error('Error updating sermon:', error);
        }
      });
  }

  cancel(): void {
    if (this.sermonForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/sermon', this.sermonId]);
      }
    } else {
      this.router.navigate(['main/sermon', this.sermonId]);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.sermonForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }
    if (control.hasError('min')) {
      return 'Value must be positive';
    }
    if (control.hasError('max')) {
      return 'Duration cannot exceed 600 minutes (10 hours)';
    }
    if (control.hasError('pattern')) {
      if (fieldName.includes('url')) {
        return 'Must be a valid URL (starting with http:// or https://)';
      }
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
