// src/app/features/building-campaign/components/commitments-list/commitments-list.component.ts

import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { BuildingCampaignService } from '../../services/building-campaign.service';
import {
  BuildingCommitment,
  BuildingCampaignStats,
} from '../../../../models/building-campaign.model';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-commitment-list',
  standalone: false,
  templateUrl: './commitment-list.html',
  styleUrl: './commitment-list.scss',
})
export class CommitmentsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('qrCanvas') qrCanvasRef!: ElementRef<HTMLCanvasElement>;

  commitments: BuildingCommitment[] = [];
  stats: BuildingCampaignStats | null = null;
  loading = true;
  loadingStats = true;
  errorMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalCount = 0;

  // Filters
  searchControl = new FormControl('');
  frequencyFilter = '';
  statusFilter = '';

  // Share / QR
  formUrl = '';
  copyLabel = 'Copy Link';
  showQrModal = false;
  qrLoading = false;

  // Delete confirm
  deletingId: string | null = null;
  deletingName = '';
  showDeleteConfirm = false;
  deleting = false;

  constructor(
    private campaignService: BuildingCampaignService,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    // Build the shareable form URL — strip any ?/# params from current URL
    const base =
      window.location.origin + window.location.pathname.replace(/\/+$/, '');
    // The form lives at /main/building-campaign/new
    const churchId = this.authService.getChurchId();
    this.formUrl =
      base.replace(/\/main\/building-campaign.*$/, '') +
      `/main/building-campaign/new?church=${churchId}`;

    this.loadStats();
    this.loadCommitments();

    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadCommitments();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data ─────────────────────────────────────────────────────

  loadStats(): void {
    this.loadingStats = true;
    this.campaignService
      .getCampaignStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.stats = s;
          this.loadingStats = false;
        },
        error: () => {
          this.loadingStats = false;
        },
      });
  }

  loadCommitments(): void {
    this.loading = true;
    const filters: any = {};
    if (this.searchControl.value) filters.search = this.searchControl.value;
    if (this.frequencyFilter) filters.frequency = this.frequencyFilter;
    if (this.statusFilter !== '')
      filters.isFulfilled = this.statusFilter === 'fulfilled';

    this.campaignService
      .getCommitments(this.currentPage, this.pageSize, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.commitments = data;
          this.totalCount = count;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadCommitments();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadCommitments();
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }
  getPageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }

  // ── Navigation ────────────────────────────────────────────────

  viewDetail(id: string): void {
    this.router.navigate([`/main/building-campaign/${id}`]);
  }
  newCommitment(): void {
    this.router.navigate(['/main/building-campaign/new']);
  }

  // ── Share / Copy link ─────────────────────────────────────────

  copyLink(): void {
    navigator.clipboard
      .writeText(this.formUrl)
      .then(() => {
        this.copyLabel = 'Copied!';
        setTimeout(() => (this.copyLabel = 'Copy Link'), 2500);
      })
      .catch(() => {
        // Fallback for browsers that block clipboard
        const ta = document.createElement('textarea');
        ta.value = this.formUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.copyLabel = 'Copied!';
        setTimeout(() => (this.copyLabel = 'Copy Link'), 2500);
      });
  }

  // ── QR Code ───────────────────────────────────────────────────

  openQrModal(): void {
    this.showQrModal = true;
    this.qrLoading = true;
    // Give Angular one tick to render the canvas before drawing
    setTimeout(() => this.drawQr(), 50);
  }

  closeQrModal(): void {
    this.showQrModal = false;
  }

  private drawQr(): void {
    const canvas = this.qrCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = 240;
    canvas.width = size;
    canvas.height = size;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(this.formUrl)}&bgcolor=ffffff&color=111827&qzone=1`;
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      this.qrLoading = false;
    };
    img.onerror = () => {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR unavailable', size / 2, size / 2);
      this.qrLoading = false;
    };
  }

  downloadQr(): void {
    const canvas = this.qrCanvasRef?.nativeElement;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = 'jirehlife-commitment-form-qr.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  // ── Delete ────────────────────────────────────────────────────

  confirmDelete(event: Event, c: BuildingCommitment): void {
    event.stopPropagation();
    this.deletingId = c.id;
    this.deletingName = c.member
      ? `${c.member.first_name} ${c.member.last_name}`
      : c.visitor_name || 'this commitment';
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deletingId = null;
    this.deletingName = '';
  }

  doDelete(): void {
    if (!this.deletingId) return;
    this.deleting = true;
    this.campaignService
      .deleteCommitment(this.deletingId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deleting = false;
          this.showDeleteConfirm = false;
          this.deletingId = null;
          this.deletingName = '';
          // Refresh both stats and list
          this.loadStats();
          this.loadCommitments();
        },
        error: (err) => {
          this.deleting = false;
          this.errorMessage = 'Could not delete: ' + err.message;
          this.showDeleteConfirm = false;
        },
      });
  }

  // ── Export ────────────────────────────────────────────────────

  exportCSV(): void {
    if (!this.commitments.length) return;
    const blob = this.campaignService.exportCommitmentsCSV(this.commitments);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `building_campaign_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ── Helpers ───────────────────────────────────────────────────

  getPledgerName(c: BuildingCommitment): string {
    if (c.member) return `${c.member.first_name} ${c.member.last_name}`;
    return c.visitor_name || 'N/A';
  }

  getPledgerContact(c: BuildingCommitment): string {
    return c.member?.member_number || c.visitor_contact || '—';
  }

  getProgressPct(c: BuildingCommitment): number {
    if (!c.total_pledge_amount) return 0;
    return Math.min(
      100,
      Math.round((c.amount_paid / c.total_pledge_amount) * 100),
    );
  }

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(n || 0);
  }

  formatDate(s: string): string {
    return new Date(s).toLocaleDateString('en-GH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
