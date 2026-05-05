// src/app/features/finance/components/category-expenses/category-expenses.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { GivingCategory, CategoryExpense } from '../../../../models/giving.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';
import { SupabaseService } from '../../../../core/services/supabase';

// ── File limits ───────────────────────────────────────────────
const IMAGE_MAX_MB  = 5;
const VIDEO_MAX_MB  = 30;
const MAX_FILES     = 5;
const IMAGE_MAX_BYTES = IMAGE_MAX_MB * 1024 * 1024;
const VIDEO_MAX_BYTES = VIDEO_MAX_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

export interface MediaFile {
  file: File;
  preview: string;      // object URL for local preview
  type: 'image' | 'video';
  uploading: boolean;
  error?: string;
  uploadedUrl?: string; // Supabase Storage URL once uploaded
}

@Component({
  selector: 'app-category-expenses',
  standalone: false,
  templateUrl: './category-expenses.html',
  styleUrl: './category-expenses.scss',
})
export class CategoryExpenses implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  expenses: CategoryExpense[] = [];
  categories: GivingCategory[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  currentPage = 1;
  pageSize = 20;
  totalExpenses = 0;
  totalPages = 0;

  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryFilterControl = new FormControl('');

  preselectedCategoryId: string | null = null;
  preselectedCategoryName: string | null = null;

  showModal = false;
  editingExpense: CategoryExpense | null = null;
  expenseForm!: FormGroup;
  saving = false;

  // ── Media upload state ────────────────────────────────────
  mediaFiles: MediaFile[] = [];
  mediaAlert = '';          // shown when user exceeds limits
  isDragOver = false;
  uploadingMedia = false;

  // Lightbox
  lightboxUrl: string | null = null;
  lightboxType: 'image' | 'video' | null = null;

  // Delete confirmation modal
  showDeleteModal = false;
  deletingExpense: CategoryExpense | null = null;
  deleting = false;

  currencies = ['GHS', 'USD', 'EUR', 'GBP'];
  canManageFinance = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCategories();

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['categoryId']) {
        this.preselectedCategoryId = params['categoryId'];
        this.categoryFilterControl.setValue(params['categoryId'], { emitEvent: false });
      }
    });

    this.loadExpenses();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    // Revoke object URLs to avoid memory leaks
    this.mediaFiles.forEach((m) => URL.revokeObjectURL(m.preview));
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const viewRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'finance_officer'];
    const manageRoles = ['finance_officer'];
    const canView = this.permissionService.isAdmin || this.permissionService.finance.view || viewRoles.includes(role);
    this.canManageFinance = this.permissionService.isAdmin || this.permissionService.finance.manage || manageRoles.includes(role);
    if (!canView) this.router.navigate(['/unauthorized']);
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    this.expenseForm = this.fb.group({
      category_id:       ['', Validators.required],
      amount:            ['', [Validators.required, Validators.min(0.01)]],
      currency:          ['GHS', Validators.required],
      expense_date:      [today, Validators.required],
      title:             ['', [Validators.required, Validators.maxLength(200)]],
      description:       ['', Validators.maxLength(500)],
      receipt_reference: ['', Validators.maxLength(100)],
    });
  }

  private loadCategories(): void {
    this.financeService.getGivingCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (cats) => {
        this.categories = cats;
        if (this.preselectedCategoryId) {
          const cat = cats.find((c) => c.id === this.preselectedCategoryId);
          this.preselectedCategoryName = cat?.name || null;
        }
      },
    });
  }

  private setupFilterListeners(): void {
    this.startDateControl.valueChanges.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
    this.endDateControl.valueChanges.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
    this.categoryFilterControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
  }

  loadExpenses(): void {
    this.loading = true;
    this.errorMessage = '';
    const filters: any = {};
    if (this.startDateControl.value) filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value) filters.endDate = this.endDateControl.value;
    if (this.categoryFilterControl.value) filters.categoryId = this.categoryFilterControl.value;

    this.financeService.getCategoryExpenses(this.currentPage, this.pageSize, filters).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ data, count }) => { this.expenses = data; this.totalExpenses = count; this.totalPages = Math.ceil(count / this.pageSize); this.loading = false; },
      error: (err) => { this.errorMessage = err.message || 'Failed to load expenses'; this.loading = false; },
    });
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
    this.categoryFilterControl.setValue('');
    this.preselectedCategoryId = null;
    this.preselectedCategoryName = null;
  }

  // ── Modal ────────────────────────────────────────────────────
  openCreateModal(): void {
    this.editingExpense = null;
    this.mediaFiles = [];
    this.mediaAlert = '';
    this.expenseForm.reset({
      currency: 'GHS',
      expense_date: new Date().toISOString().split('T')[0],
      category_id: this.categoryFilterControl.value || '',
    });
    this.showModal = true;
  }

  openEditModal(expense: CategoryExpense, event: Event): void {
    event.stopPropagation();
    this.editingExpense = expense;
    this.mediaFiles = [];
    this.mediaAlert = '';

    // Pre-populate existing media as "already uploaded" entries
    if (expense.receipt_media_urls?.length) {
      expense.receipt_media_urls.forEach((url) => {
        const isVideo = url.includes('.mp4') || url.includes('.mov') || url.includes('.webm');
        this.mediaFiles.push({
          file: null as any,
          preview: url,
          type: isVideo ? 'video' : 'image',
          uploading: false,
          uploadedUrl: url,
        });
      });
    }

    this.expenseForm.patchValue({
      category_id:       expense.category_id,
      amount:            expense.amount,
      currency:          expense.currency,
      expense_date:      expense.expense_date,
      title:             expense.title,
      description:       expense.description || '',
      receipt_reference: expense.receipt_reference || '',
    });
    this.showModal = true;
  }

  closeModal(): void {
    // Revoke only new (not-yet-uploaded) previews
    this.mediaFiles
      .filter((m) => !m.uploadedUrl)
      .forEach((m) => URL.revokeObjectURL(m.preview));
    this.mediaFiles = [];
    this.mediaAlert = '';
    this.showModal = false;
    this.editingExpense = null;
    this.expenseForm.reset({ currency: 'GHS', expense_date: new Date().toISOString().split('T')[0] });
  }

  // ── File handling ─────────────────────────────────────────────
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = ''; // reset so same file can be re-added after removal
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void { this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  private addFiles(files: File[]): void {
    this.mediaAlert = '';

    for (const file of files) {
      // Check total count
      if (this.mediaFiles.length >= MAX_FILES) {
        this.mediaAlert = `Maximum ${MAX_FILES} files allowed. Remove one to add more.`;
        break;
      }

      // Check type
      if (!ALLOWED_TYPES.includes(file.type)) {
        this.mediaAlert = `"${file.name}" is not supported. Allowed: JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM.`;
        continue;
      }

      // Check size
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
      if (isVideo && file.size > VIDEO_MAX_BYTES) {
        this.mediaAlert = `"${file.name}" exceeds the ${VIDEO_MAX_MB} MB video limit (${this.formatBytes(file.size)}).`;
        continue;
      }
      if (!isVideo && file.size > IMAGE_MAX_BYTES) {
        this.mediaAlert = `"${file.name}" exceeds the ${IMAGE_MAX_MB} MB image limit (${this.formatBytes(file.size)}).`;
        continue;
      }

      const preview = URL.createObjectURL(file);
      this.mediaFiles.push({
        file,
        preview,
        type: isVideo ? 'video' : 'image',
        uploading: false,
      });
    }
  }

  removeMedia(index: number): void {
    const m = this.mediaFiles[index];
    if (!m.uploadedUrl) URL.revokeObjectURL(m.preview); // only revoke local previews
    this.mediaFiles.splice(index, 1);
    this.mediaAlert = '';
  }

  // ── Upload all pending files to Supabase Storage ─────────────
  private async uploadPendingMedia(): Promise<string[]> {
    const churchId  = this.authService.getChurchId();
    const uploaded: string[] = [];

    for (const m of this.mediaFiles) {
      if (m.uploadedUrl) {
        // Already uploaded (existing expense being edited)
        uploaded.push(m.uploadedUrl);
        continue;
      }

      m.uploading = true;
      const ext      = m.file.name.split('.').pop();
      const ts       = Date.now();
      const path     = `${churchId}/${ts}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const { data, error } = await this.supabase.client.storage
        .from('expense-receipts')
        .upload(path, m.file, {
          cacheControl: '3600',
          upsert: false,
          contentType: m.file.type,
        });

      m.uploading = false;

      if (error) {
        m.error = 'Upload failed';
        console.error('Upload error:', error.message);
        continue;
      }

      // Get a signed URL valid for 10 years (for receipt archival)
      const { data: signedData } = await this.supabase.client.storage
        .from('expense-receipts')
        .createSignedUrl(data.path, 60 * 60 * 24 * 365 * 10);

      if (signedData?.signedUrl) {
        m.uploadedUrl = signedData.signedUrl;
        uploaded.push(signedData.signedUrl);
      }
    }

    return uploaded;
  }

  // ── Save ──────────────────────────────────────────────────────
  async saveExpense(): Promise<void> {
    if (this.expenseForm.invalid) {
      Object.keys(this.expenseForm.controls).forEach((k) => this.expenseForm.get(k)?.markAsTouched());
      return;
    }

    this.saving = true;
    this.uploadingMedia = this.mediaFiles.some((m) => !m.uploadedUrl && !m.error);

    // Upload any new files first
    let mediaUrls: string[] = [];
    try {
      mediaUrls = await this.uploadPendingMedia();
    } catch (err) {
      this.errorMessage = 'Media upload failed. Please try again.';
      this.saving = false;
      this.uploadingMedia = false;
      return;
    }
    this.uploadingMedia = false;

    const formVal = this.expenseForm.value;
    const data = {
      ...formVal,
      amount: parseFloat(formVal.amount),
      receipt_media_urls: mediaUrls,
    };

    const obs$ = this.editingExpense
      ? this.financeService.updateCategoryExpense(this.editingExpense.id, data)
      : this.financeService.createCategoryExpense(data);

    obs$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = this.editingExpense ? 'Expense updated!' : 'Expense recorded!';
        this.saving = false;
        this.closeModal();
        this.loadExpenses();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => { this.errorMessage = err.message || 'Failed to save expense'; this.saving = false; },
    });
  }

  // Opens the confirmation modal instead of browser confirm()
  openDeleteModal(expense: CategoryExpense, event: Event): void {
    event.stopPropagation();
    if (!this.canManageFinance) { this.errorMessage = 'No permission to delete expenses'; return; }
    this.deletingExpense = expense;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deletingExpense = null;
  }

  confirmDelete(): void {
    if (!this.deletingExpense) return;
    this.deleting = true;

    this.financeService.deleteCategoryExpense(this.deletingExpense.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deleting = false;
          this.closeDeleteModal();
          this.successMessage = 'Expense deleted successfully!';
          this.loadExpenses();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.deleting = false;
          this.errorMessage = err.message || 'Failed to delete expense';
          this.closeDeleteModal();
        },
      });
  }

  // ── Lightbox ──────────────────────────────────────────────────
  openLightbox(url: string, type: 'image' | 'video'): void {
    this.lightboxUrl  = url;
    this.lightboxType = type;
  }
  closeLightbox(): void { this.lightboxUrl = null; this.lightboxType = null; }

  // ── Helpers ───────────────────────────────────────────────────
  previousPage(): void { if (this.currentPage > 1) { this.currentPage--; this.loadExpenses(); } }
  nextPage(): void { if (this.currentPage < this.totalPages) { this.currentPage++; this.loadExpenses(); } }

  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  isVideo(url: string): boolean {
    return /\.(mp4|mov|webm)(\?|$)/i.test(url);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.expenseForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('min')) return 'Amount must be greater than 0';
    if (control.hasError('maxlength')) return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  goBack(): void { this.location.back(); }

  get pendingUploadCount(): number {
    return this.mediaFiles.filter((m) => !m.uploadedUrl).length;
  }
}
