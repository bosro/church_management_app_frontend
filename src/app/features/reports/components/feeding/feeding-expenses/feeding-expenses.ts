
// src/app/features/reports/components/feeding-expenses/feeding-expenses.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { generateAcademicYears, TERMS } from '../../../../../models/school.model';
import { FeedingService } from '../../../services/feeding.service';
import { SupabaseService } from '../../../../../core/services/supabase';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { FeedingFilterService } from '../../../services/feeding-filter.service';


const IMAGE_MAX_MB    = 5;
const VIDEO_MAX_MB    = 30;
const MAX_FILES       = 5;
const IMAGE_MAX_BYTES = IMAGE_MAX_MB * 1024 * 1024;
const VIDEO_MAX_BYTES = VIDEO_MAX_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4','video/quicktime','video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

export interface FeedingExpense {
  id: string;
  church_id: string;
  academic_year: string;
  term: string;
  amount: number;
  currency: string;
  expense_date: string;
  title: string;
  description?: string;
  receipt_reference?: string;
  receipt_media_urls?: string[];
  recorded_by: string;
  created_at: string;
  updated_at?: string;
}

export interface FeedingExpensesSummary {
  total_collected: number;
  total_expenses: number;
  net_balance: number;
  expense_count: number;
}

export interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
  uploading: boolean;
  error?: string;
  uploadedUrl?: string;
}

@Component({
  selector: 'app-feeding-expenses',
  standalone: false,
  templateUrl: './feeding-expenses.html',
  styleUrl: './feeding-expenses.scss',
})
export class FeedingExpenses implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  expenses: FeedingExpense[] = [];
  summary: FeedingExpensesSummary | null = null;
  loading      = false;
  errorMessage = '';
  successMessage = '';

  currentPage  = 1;
  pageSize     = 20;
  totalExpenses = 0;
  totalPages   = 0;

  // Filters
  startDateControl = new FormControl('');
  endDateControl   = new FormControl('');
  selectedTerm     = '';
  selectedYear     = '';
  terms            = TERMS;
  academicYears    = generateAcademicYears();

  canManage = false;

  // Modal
  showModal       = false;
  editingExpense: FeedingExpense | null = null;
  expenseForm!: FormGroup;
  saving          = false;
  uploadingMedia  = false;

  // Media
  mediaFiles: MediaFile[] = [];
  mediaAlert  = '';
  isDragOver  = false;

  // Lightbox
  lightboxUrl:  string | null = null;
  lightboxType: 'image' | 'video' | null = null;

  // Delete modal
  showDeleteModal  = false;
  deletingExpense: FeedingExpense | null = null;
  deleting         = false;

  currencies = ['GHS', 'USD', 'EUR', 'GBP'];

  constructor(
    private fb:           FormBuilder,
    private feedingService: FeedingService,
    private supabase:     SupabaseService,
    private router:       Router,
    private location:     Location,
    public  permissionService: PermissionService,
    private authService:  AuthService,
    public  feedingFilter: FeedingFilterService,
  ) {}

  ngOnInit(): void {
    this.selectedTerm = this.feedingFilter.term;
    this.selectedYear = this.feedingFilter.year;
    this.checkPermissions();
    this.initForm();
    this.loadExpenses();
    this.loadSummary();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    this.mediaFiles.forEach(m => URL.revokeObjectURL(m.preview));
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.school?.manage ||
      this.permissionService.school?.fees;
    if (!this.permissionService.isAdmin && !this.permissionService.school?.fees && !this.permissionService.school?.view) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    this.expenseForm = this.fb.group({
      title:             ['', [Validators.required, Validators.maxLength(200)]],
      academic_year:     [this.selectedYear, Validators.required],
      term:              [this.selectedTerm, Validators.required],
      amount:            ['', [Validators.required, Validators.min(0.01)]],
      currency:          ['GHS', Validators.required],
      expense_date:      [today, Validators.required],
      description:       ['', Validators.maxLength(500)],
      receipt_reference: ['', Validators.maxLength(100)],
    });
  }

  private setupFilterListeners(): void {
    this.startDateControl.valueChanges
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
    this.endDateControl.valueChanges
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
  }

  onTermYearChange(): void {
    this.currentPage = 1;
    this.loadExpenses();
    this.loadSummary();
  }

  loadExpenses(): void {
    this.loading = true;
    this.errorMessage = '';
    const filters: any = {
      academicYear: this.selectedYear,
      term: this.selectedTerm,
    };
    if (this.startDateControl.value) filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value)   filters.endDate   = this.endDateControl.value;

    this._fetchExpenses(this.currentPage, this.pageSize, filters)
      .then(({ data, count }) => {
        this.expenses      = data;
        this.totalExpenses = count;
        this.totalPages    = Math.ceil(count / this.pageSize);
        this.loading       = false;
      })
      .catch(err => {
        this.errorMessage = err.message;
        this.loading = false;
      });
  }

  private async _fetchExpenses(
    page: number,
    pageSize: number,
    filters?: any,
  ): Promise<{ data: FeedingExpense[]; count: number }> {
    const churchId = this.authService.getChurchId() || '';
    const offset   = (page - 1) * pageSize;

    let query = this.supabase.client
      .from('feeding_expenses')
      .select('*', { count: 'exact' })
      .eq('church_id', churchId);

    if (filters?.academicYear) query = query.eq('academic_year', filters.academicYear);
    if (filters?.term)         query = query.eq('term', filters.term);
    if (filters?.startDate)    query = query.gte('expense_date', filters.startDate);
    if (filters?.endDate)      query = query.lte('expense_date', filters.endDate);

    const { data, error, count } = await query
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    return { data: (data || []) as FeedingExpense[], count: count || 0 };
  }

  loadSummary(): void {
    const churchId = this.authService.getChurchId() || '';
    this.supabase.client
      .rpc('get_feeding_expenses_summary', {
        p_church_id:     churchId,
        p_academic_year: this.selectedYear,
        p_term:          this.selectedTerm,
      })
      .then(({ data, error }) => {
        if (error) return;
        if (Array.isArray(data) && data.length > 0) {
          this.summary = data[0] as FeedingExpensesSummary;
        } else {
          this.summary = data as FeedingExpensesSummary;
        }
      });
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
  }

  // ── Modal ────────────────────────────────────────────────
  openCreateModal(): void {
    this.editingExpense = null;
    this.mediaFiles     = [];
    this.mediaAlert     = '';
    this.expenseForm.reset({
      currency:      'GHS',
      expense_date:  new Date().toISOString().split('T')[0],
      academic_year: this.selectedYear,
      term:          this.selectedTerm,
    });
    this.showModal = true;
  }

  openEditModal(expense: FeedingExpense, event: Event): void {
    event.stopPropagation();
    this.editingExpense = expense;
    this.mediaFiles     = [];
    this.mediaAlert     = '';

    if (expense.receipt_media_urls?.length) {
      expense.receipt_media_urls.forEach(url => {
        const isVideo = /\.(mp4|mov|webm)/i.test(url);
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
      title:             expense.title,
      academic_year:     expense.academic_year,
      term:              expense.term,
      amount:            expense.amount,
      currency:          expense.currency,
      expense_date:      expense.expense_date,
      description:       expense.description       || '',
      receipt_reference: expense.receipt_reference || '',
    });
    this.showModal = true;
  }

  closeModal(): void {
    this.mediaFiles.filter(m => !m.uploadedUrl).forEach(m => URL.revokeObjectURL(m.preview));
    this.mediaFiles = [];
    this.mediaAlert = '';
    this.showModal  = false;
    this.editingExpense = null;
    this.expenseForm.reset({
      currency:     'GHS',
      expense_date: new Date().toISOString().split('T')[0],
      academic_year: this.selectedYear,
      term:          this.selectedTerm,
    });
  }

  // ── File handling ─────────────────────────────────────────
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) { this.addFiles(Array.from(input.files)); input.value = ''; }
  }
  onDragOver(e: DragEvent): void  { e.preventDefault(); this.isDragOver = true; }
  onDragLeave(): void             { this.isDragOver = false; }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.isDragOver = false;
    if (e.dataTransfer?.files) this.addFiles(Array.from(e.dataTransfer.files));
  }

  private addFiles(files: File[]): void {
    this.mediaAlert = '';
    for (const file of files) {
      if (this.mediaFiles.length >= MAX_FILES)     { this.mediaAlert = `Maximum ${MAX_FILES} files allowed.`; break; }
      if (!ALLOWED_TYPES.includes(file.type))      { this.mediaAlert = `"${file.name}" is not a supported type.`; continue; }
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
      if (isVideo  && file.size > VIDEO_MAX_BYTES) { this.mediaAlert = `"${file.name}" exceeds ${VIDEO_MAX_MB} MB video limit.`; continue; }
      if (!isVideo && file.size > IMAGE_MAX_BYTES) { this.mediaAlert = `"${file.name}" exceeds ${IMAGE_MAX_MB} MB image limit.`; continue; }
      this.mediaFiles.push({ file, preview: URL.createObjectURL(file), type: isVideo ? 'video' : 'image', uploading: false });
    }
  }

  removeMedia(index: number): void {
    const m = this.mediaFiles[index];
    if (!m.uploadedUrl) URL.revokeObjectURL(m.preview);
    this.mediaFiles.splice(index, 1);
    this.mediaAlert = '';
  }

  private async uploadPendingMedia(): Promise<string[]> {
    const churchId = this.authService.getChurchId();
    const uploaded: string[] = [];
    for (const m of this.mediaFiles) {
      if (m.uploadedUrl) { uploaded.push(m.uploadedUrl); continue; }
      m.uploading = true;
      const ext  = m.file.name.split('.').pop();
      const path = `${churchId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const { data, error } = await this.supabase.client.storage
        .from('feeding-expense-receipts')
        .upload(path, m.file, { cacheControl: '3600', upsert: false, contentType: m.file.type });
      m.uploading = false;
      if (error) { m.error = 'Upload failed'; continue; }
      const { data: signed } = await this.supabase.client.storage
        .from('feeding-expense-receipts')
        .createSignedUrl(data.path, 60 * 60 * 24 * 365 * 10);
      if (signed?.signedUrl) { m.uploadedUrl = signed.signedUrl; uploaded.push(signed.signedUrl); }
    }
    return uploaded;
  }

  // ── Save ──────────────────────────────────────────────────
  async saveExpense(): Promise<void> {
    if (this.expenseForm.invalid) {
      Object.keys(this.expenseForm.controls).forEach(k =>
        this.expenseForm.get(k)?.markAsTouched(),
      );
      return;
    }
    this.saving         = true;
    this.uploadingMedia = this.mediaFiles.some(m => !m.uploadedUrl && !m.error);

    let mediaUrls: string[] = [];
    try {
      mediaUrls = await this.uploadPendingMedia();
    } catch {
      this.errorMessage   = 'Media upload failed. Please try again.';
      this.saving         = false;
      this.uploadingMedia = false;
      return;
    }
    this.uploadingMedia = false;

    const v      = this.expenseForm.value;
    const userId = this.authService.getUserId();
    const churchId = this.authService.getChurchId() || '';

    const payload = {
      church_id:            churchId,
      title:                v.title,
      academic_year:        v.academic_year,
      term:                 v.term,
      amount:               parseFloat(v.amount),
      currency:             v.currency,
      expense_date:         v.expense_date,
      description:          v.description  || null,
      receipt_reference:    v.receipt_reference || null,
      receipt_media_urls:   mediaUrls,
      recorded_by:          userId,
    };

    try {
      if (this.editingExpense) {
        const { error } = await this.supabase.client
          .from('feeding_expenses')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', this.editingExpense.id)
          .eq('church_id', churchId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await this.supabase.client
          .from('feeding_expenses')
          .insert(payload);
        if (error) throw new Error(error.message);
      }

      this.successMessage = this.editingExpense ? 'Expense updated!' : 'Expense recorded!';
      this.saving = false;
      this.closeModal();
      this.loadExpenses();
      this.loadSummary();
      setTimeout(() => (this.successMessage = ''), 3000);
    } catch (err: any) {
      this.errorMessage = err.message;
      this.saving = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────
  openDeleteModal(expense: FeedingExpense, event: Event): void {
    event.stopPropagation();
    this.deletingExpense = expense;
    this.showDeleteModal = true;
  }
  closeDeleteModal(): void { this.showDeleteModal = false; this.deletingExpense = null; }

  async confirmDelete(): Promise<void> {
    if (!this.deletingExpense) return;
    this.deleting = true;
    const churchId = this.authService.getChurchId() || '';

    try {
      const { error } = await this.supabase.client
        .from('feeding_expenses')
        .delete()
        .eq('id', this.deletingExpense.id)
        .eq('church_id', churchId);
      if (error) throw new Error(error.message);

      this.deleting = false;
      this.closeDeleteModal();
      this.successMessage = 'Expense deleted.';
      this.loadExpenses();
      this.loadSummary();
      setTimeout(() => (this.successMessage = ''), 3000);
    } catch (err: any) {
      this.deleting = false;
      this.errorMessage = err.message;
      this.closeDeleteModal();
    }
  }

  // ── Lightbox ──────────────────────────────────────────────
  openLightbox(url: string, type: 'image' | 'video'): void { this.lightboxUrl = url; this.lightboxType = type; }
  closeLightbox(): void { this.lightboxUrl = null; this.lightboxType = null; }

  // ── Pagination ────────────────────────────────────────────
  previousPage(): void { if (this.currentPage > 1) { this.currentPage--; this.loadExpenses(); } }
  nextPage():     void { if (this.currentPage < this.totalPages) { this.currentPage++; this.loadExpenses(); } }

  // ── Helpers ───────────────────────────────────────────────
  isVideo(url: string): boolean { return /\.(mp4|mov|webm)(\?|$)/i.test(url); }

  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  getErrorMessage(field: string): string {
    const c = this.expenseForm.get(field);
    if (!c?.errors || !c.touched) return '';
    if (c.hasError('required'))  return 'This field is required';
    if (c.hasError('min'))       return 'Amount must be greater than 0';
    if (c.hasError('maxlength')) return `Max ${c.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  goBack(): void { this.location.back(); }
}
