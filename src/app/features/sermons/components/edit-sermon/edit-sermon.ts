
// src/app/features/sermons/components/edit-sermon/edit-sermon.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Sermon, SermonSeries, SermonsService } from '../../services/sermons';

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

  constructor(
    private fb: FormBuilder,
    private sermonsService: SermonsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.sermonId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    this.loadSermonSeries();
    if (this.sermonId) {
      this.loadSermon();
    }
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

  private loadSermon(): void {
    this.loadingSermon = true;

    this.sermonsService.getSermonById(this.sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sermon) => {
          this.sermon = sermon;
          this.populateForm(sermon);
          this.loadingSermon = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load sermon';
          this.loadingSermon = false;
        }
      });
  }

  private populateForm(sermon: Sermon): void {
    this.sermonForm.patchValue({
      title: sermon.title,
      description: sermon.description,
      preacher_name: sermon.preacher_name,
      sermon_date: sermon.sermon_date,
      series_name: sermon.series_name,
      scripture_reference: sermon.scripture_reference,
      audio_url: sermon.audio_url,
      video_url: sermon.video_url,
      notes_url: sermon.notes_url,
      thumbnail_url: sermon.thumbnail_url,
      duration: sermon.duration,
      tags: sermon.tags ? sermon.tags.join(', ') : ''
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

    this.sermonsService.updateSermon(this.sermonId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Sermon updated successfully!';
          setTimeout(() => {
            this.router.navigate(['main/sermon']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update sermon. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/sermon']);
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
