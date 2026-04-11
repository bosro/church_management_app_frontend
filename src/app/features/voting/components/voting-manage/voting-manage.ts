// src/app/features/voting/components/voting-manage/voting-manage.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { VotingService } from '../../services/voting.service';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-voting-manage',
  standalone: false,
  templateUrl: './voting-manage.html',
  styleUrl: './voting-manage.scss',
})
export class VotingManage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  categoryId = '';
  isEdit = false;
  form!: FormGroup;
  loading = false;
  loadingData = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private votingService: VotingService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    const canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    if (!canManage) {
      this.router.navigate(['/main/voting']);
      return;
    }

    this.initForm();
    this.categoryId = this.route.snapshot.paramMap.get('id') || '';
    this.isEdit = !!this.categoryId;

    if (this.isEdit) {
      this.loadCategory();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    this.form = this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
        ],
      ],
      description: ['', Validators.maxLength(500)],
      max_votes_per_user: [
        1,
        [Validators.required, Validators.min(1), Validators.max(10)],
      ],
      voting_start_at: [this.toDateTimeLocal(tomorrow), Validators.required],
      voting_end_at: [this.toDateTimeLocal(nextWeek), Validators.required],
      nominations_start_at: [this.toDateTimeLocal(now)],
      nominations_end_at: [this.toDateTimeLocal(tomorrow)],
      show_results: [false],
    });
  }

  private loadCategory(): void {
    this.loadingData = true;
    this.votingService
      .getCategoryById(this.categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cat) => {
          this.form.patchValue({
            title: cat.title,
            description: cat.description || '',
            max_votes_per_user: cat.max_votes_per_user,
            voting_start_at: this.toDateTimeLocal(
              new Date(cat.voting_start_at),
            ),
            voting_end_at: this.toDateTimeLocal(new Date(cat.voting_end_at)),
            nominations_start_at: cat.nominations_start_at
              ? this.toDateTimeLocal(new Date(cat.nominations_start_at))
              : '',
            nominations_end_at: cat.nominations_end_at
              ? this.toDateTimeLocal(new Date(cat.nominations_end_at))
              : '',
            show_results: cat.show_results,
          });
          this.loadingData = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load category';
          this.loadingData = false;
        },
      });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    const value = this.form.value;

    // Validate dates
    const start = new Date(value.voting_start_at);
    const end = new Date(value.voting_end_at);
    if (end <= start) {
      this.errorMessage = 'Voting end date must be after the start date';
      return;
    }

    const payload = {
      ...value,
      voting_start_at: new Date(value.voting_start_at).toISOString(),
      voting_end_at: new Date(value.voting_end_at).toISOString(),
      nominations_start_at: value.nominations_start_at
        ? new Date(value.nominations_start_at).toISOString()
        : null,
      nominations_end_at: value.nominations_end_at
        ? new Date(value.nominations_end_at).toISOString()
        : null,
    };

    this.loading = true;
    this.errorMessage = '';

    const request = this.isEdit
      ? this.votingService.updateCategory(this.categoryId, payload)
      : this.votingService.createCategory(payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (cat) => {
        this.successMessage = this.isEdit
          ? 'Category updated successfully!'
          : 'Category created successfully!';
        this.loading = false;
        setTimeout(() => {
          this.router.navigate(['/main/voting', cat.id]);
        }, 1200);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to save category';
        this.loading = false;
      },
    });
  }

  cancel(): void {
    if (this.form.dirty && !confirm('Discard unsaved changes?')) return;
    this.router.navigate(
      this.isEdit ? ['/main/voting', this.categoryId] : ['/main/voting'],
    );
  }

  getError(field: string): string {
    const c = this.form.get(field);
    if (!c || !c.errors || !c.touched) return '';
    if (c.hasError('required')) return 'This field is required';
    if (c.hasError('minlength'))
      return `Minimum ${c.getError('minlength').requiredLength} characters`;
    if (c.hasError('maxlength'))
      return `Maximum ${c.getError('maxlength').requiredLength} characters`;
    if (c.hasError('min')) return `Minimum value is ${c.getError('min').min}`;
    if (c.hasError('max')) return `Maximum value is ${c.getError('max').max}`;
    return 'Invalid input';
  }

  private toDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
