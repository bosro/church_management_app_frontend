// src/app/features/building-campaign/components/commitments-list/commitments-list.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import {
  BuildingCampaignStats,
  BuildingCommitment,
} from '../../../../models/building-campaign.model';
import { BuildingCampaignService } from '../../services/building-campaign.service';

@Component({
  selector: 'app-commitment-list',
  standalone: false,
  templateUrl: './commitment-list.html',
  styleUrl: './commitment-list.scss',
})
export class CommitmentList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

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

  constructor(
    private campaignService: BuildingCampaignService,
    private router: Router,
  ) {}

  ngOnInit(): void {
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

  viewDetail(id: string): void {
    this.router.navigate([`/main/building-campaign/${id}`]);
  }

  newCommitment(): void {
    this.router.navigate(['/main/building-campaign/new']);
  }

  exportCSV(): void {
    if (!this.commitments.length) return;
    const blob = this.campaignService.exportCommitmentsCSV(this.commitments);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `building_campaign_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

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

  getPageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }
}
