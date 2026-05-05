// src/app/features/finance/components/finance-reports/finance-reports.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  FinanceService,
  GivingStatistics,
  CombinedGivingStats,
  TopGiver,
} from '../../services/finance.service';
import {
  CategoryGivingStat,
  CategoryGiver,
} from '../../../../models/giving.model';
import { Router } from '@angular/router';
import { PermissionService } from '../../../../core/services/permission.service';
import { Location } from '@angular/common';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-finance-reports',
  standalone: false,
  templateUrl: './finance-reports.html',
  styleUrl: './finance-reports.scss',
})
export class FinanceReports implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('giversSection') giversSection!: ElementRef;

  loading = true;
  statistics: GivingStatistics | null = null;
  combinedStats: CombinedGivingStats | null = null;
  topGivers: TopGiver[] = [];
  errorMessage = '';
  successMessage = '';

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  // Date filters for giving export
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');

  // Category breakdown
  categoryStats: CategoryGivingStat[] = [];
  loadingCategoryStats = false;

  // Category drill-down
  selectedCategory: CategoryGivingStat | null = null;
  categoryGivers: CategoryGiver[] = [];
  loadingGivers = false;

  // Category filter date range
  categoryStartDate = new FormControl('');
  categoryEndDate = new FormControl('');

  // Permissions
  canViewFinance = false;

  // Export modals
  showGivingExportModal = false;
  showPledgesExportModal = false;
  showExpensesExportModal = false;
  exporting = false;

  private iconPalette = [
    { icon: 'ri-hand-heart-line',         bg: '#DDD6FE', color: '#5B21B6' },
    { icon: 'ri-money-dollar-circle-line', bg: '#D1FAE5', color: '#059669' },
    { icon: 'ri-building-line',            bg: '#DBEAFE', color: '#2563EB' },
    { icon: 'ri-heart-line',               bg: '#FCE7F3', color: '#DB2777' },
    { icon: 'ri-star-line',                bg: '#FEF3C7', color: '#D97706' },
    { icon: 'ri-gift-line',                bg: '#FEE2E2', color: '#DC2626' },
    { icon: 'ri-plant-line',               bg: '#ECFDF5', color: '#10B981' },
    { icon: 'ri-home-heart-line',          bg: '#EFF6FF', color: '#3B82F6' },
  ];

  constructor(
    private financeService: FinanceService,
    private router: Router,
    public permissionService: PermissionService,
    private location: Location,
    private authService: AuthService,
  ) {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      this.years.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadReports();
    this.loadCategoryStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const viewRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'finance_officer'];

    this.canViewFinance =
      this.permissionService.isAdmin ||
      this.permissionService.finance.view ||
      this.permissionService.finance.reports ||
      viewRoles.includes(role);

    if (!this.canViewFinance) this.router.navigate(['/unauthorized']);
  }

  // ── Overview stats & top givers ─────────────────────────────

  loadReports(): void {
    this.loading = true;
    this.errorMessage = '';

    // Combined stats (individual + bulk + expenses) — primary source
    this.financeService
      .getCombinedGivingStats(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.combinedStats = stats;
          this.loading = false;
        },
        error: () => {
          // Fallback to old RPC if new one not deployed yet
          this.financeService
            .getGivingStatistics(this.selectedYear)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (stats) => { this.statistics = stats; this.loading = false; },
              error: (error) => { this.errorMessage = error.message || 'Failed to load statistics'; this.loading = false; },
            });
        },
      });

    this.financeService
      .getTopGivers(10, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => { this.topGivers = givers; },
        error: () => {},
      });
  }

  onYearChange(): void {
    this.loadReports();
    this.loadCategoryStats();
    this.selectedCategory = null;
    this.categoryGivers = [];
  }

  // ── Stat helpers — prefer combinedStats over old statistics ──
  get overviewTotalGiving(): number {
    return this.combinedStats?.combined_total ?? this.statistics?.total_giving ?? 0;
  }
  get overviewTithes(): number {
    return this.combinedStats?.individual_tithes ?? this.statistics?.total_tithes ?? 0;
  }
  get overviewOfferings(): number {
    return this.combinedStats?.individual_offerings ?? this.statistics?.total_offerings ?? 0;
  }
  get overviewTransactions(): number {
    const ind = this.combinedStats?.individual_transactions ?? this.statistics?.total_transactions ?? 0;
    const bulk = this.combinedStats?.bulk_records_count ?? 0;
    return ind + bulk;
  }
  get overviewAvg(): number {
    return this.combinedStats?.individual_avg ?? this.statistics?.avg_giving ?? 0;
  }
  get overviewHighest(): number {
    return this.combinedStats?.individual_highest ?? this.statistics?.highest_giving ?? 0;
  }
  get overviewBulkTotal(): number {
    return this.combinedStats?.bulk_total ?? 0;
  }
  get overviewExpenses(): number {
    return this.combinedStats?.total_expenses ?? 0;
  }
  get overviewNetBalance(): number {
    return this.combinedStats?.net_total ?? this.overviewTotalGiving;
  }

  // ── Category breakdown ───────────────────────────────────────

  loadCategoryStats(): void {
    this.loadingCategoryStats = true;

    const start = this.categoryStartDate.value || undefined;
    const end = this.categoryEndDate.value || undefined;
    const year = start || end ? undefined : this.selectedYear;

    this.financeService
      .getCategoryGivingStats(year, start, end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.categoryStats = stats;
          this.loadingCategoryStats = false;
          if (this.selectedCategory) {
            const refreshed = stats.find(
              (s) => s.category_id === this.selectedCategory!.category_id,
            );
            if (refreshed) {
              this.selectedCategory = refreshed;
              this.loadCategoryGivers(refreshed.category_id);
            }
          }
        },
        error: () => { this.loadingCategoryStats = false; },
      });
  }

  applyCategoryFilters(): void {
    this.selectedCategory = null;
    this.categoryGivers = [];
    this.loadCategoryStats();
  }

  clearCategoryFilters(): void {
    this.categoryStartDate.setValue('');
    this.categoryEndDate.setValue('');
    this.selectedCategory = null;
    this.categoryGivers = [];
    this.loadCategoryStats();
  }

  selectCategory(stat: CategoryGivingStat): void {
    if (this.selectedCategory?.category_id === stat.category_id) {
      this.selectedCategory = null;
      this.categoryGivers = [];
      return;
    }
    this.selectedCategory = stat;
    this.loadCategoryGivers(stat.category_id);

    setTimeout(() => {
      this.giversSection?.nativeElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 150);
  }

  private loadCategoryGivers(categoryId: string): void {
    this.loadingGivers = true;
    this.categoryGivers = [];

    const start = this.categoryStartDate.value || undefined;
    const end = this.categoryEndDate.value || undefined;
    const year = start || end ? undefined : this.selectedYear;

    this.financeService
      .getCategoryGivers(categoryId, year, start, end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => { this.categoryGivers = givers; this.loadingGivers = false; },
        error: () => { this.loadingGivers = false; },
      });
  }

  getCategoryIcon(index: number): string { return this.iconPalette[index % this.iconPalette.length].icon; }
  getCategoryIconBg(index: number): string { return this.iconPalette[index % this.iconPalette.length].bg; }
  getCategoryIconColor(index: number): string { return this.iconPalette[index % this.iconPalette.length].color; }

  getGiverInitials(name: string): string {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  // ── Export: Giving Report ────────────────────────────────────

  exportGivingReport(): void {
    const startDate = this.startDateControl.value || '';
    const endDate = this.endDateControl.value || '';

    if (!startDate || !endDate) {
      this.errorMessage = 'Please select both start and end dates';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      this.errorMessage = 'Start date cannot be after end date';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    this.showGivingExportModal = true;
  }

  exportGivingAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showGivingExportModal = false;

    const startDate = this.startDateControl.value || '';
    const endDate = this.endDateControl.value || '';
    const fileName = `giving_report_${startDate}_to_${endDate}`;

    this.financeService
      .exportGivingReport(startDate, endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (csvBlob) => {
          if (format === 'csv') {
            this.downloadFile(csvBlob, `${fileName}.csv`);
            this.showSuccess('Giving report exported successfully!');
            this.exporting = false;
          } else {
            this.financeService
              .getGivingTransactions(1, 10000, { startDate, endDate })
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: ({ data }) => {
                  if (format === 'excel') this.exportGivingExcel(data, fileName, startDate, endDate);
                  else this.exportGivingPDF(data, fileName, startDate, endDate);
                },
                error: (err) => {
                  this.errorMessage = 'Export failed: ' + (err.message || 'Unknown error');
                  this.exporting = false;
                },
              });
          }
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to export giving report';
          this.exporting = false;
        },
      });
  }

  // Excel: 3 sheets — Individual Transactions, Bulk Records, Summary
  private exportGivingExcel(data: any[], fileName: string, startDate: string, endDate: string): void {
    const workbook = XLSX.utils.book_new();

    // Sheet 1 — Individual transactions
    const rows = data.map((t: any) => ({
      Date: t.transaction_date || '',
      Member: t.member ? `${t.member.first_name} ${t.member.last_name}` : 'Anonymous',
      'Member Number': t.member?.member_number || 'N/A',
      Category: t.category?.name || 'General',
      Amount: t.amount,
      Currency: t.currency,
      'Payment Method': t.payment_method,
      Reference: t.transaction_reference || '',
      Notes: t.notes || '',
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No individual records in this period' }]);
    ws1['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, ws1, 'Individual Transactions');

    // Sheet 2 — Bulk giving records for the same date range
    this.financeService
      .getBulkGivingRecords(1, 10000, { startDate, endDate })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data: bulkData }) => {
          const bulkRows = bulkData.map((b: any) => ({
            Date: b.record_date || '',
            Category: b.category_name || 'General',
            'Total Amount': b.total_amount,
            Currency: b.currency,
            'Payment Method': b.payment_method,
            'No. of Contributors': b.attendee_count ?? 'N/A',
            Description: b.description || '',
            Notes: b.notes || '',
          }));
          const ws2 = XLSX.utils.json_to_sheet(bulkRows.length ? bulkRows : [{ Note: 'No bulk records in this period' }]);
          ws2['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 24 }];
          XLSX.utils.book_append_sheet(workbook, ws2, 'Bulk Records');

          // Sheet 3 — Summary
          const indTotal = data.reduce((sum, t) => sum + (t.amount || 0), 0);
          const bulkTotal = bulkData.reduce((sum, b) => sum + (b.total_amount || 0), 0);
          const summaryRows = [
            { Info: 'Period', Value: `${startDate} to ${endDate}` },
            { Info: 'Individual Transactions', Value: data.length },
            { Info: 'Individual Total (GHS)', Value: indTotal.toFixed(2) },
            { Info: 'Bulk Records', Value: bulkData.length },
            { Info: 'Bulk Total (GHS)', Value: bulkTotal.toFixed(2) },
            { Info: 'Combined Total (GHS)', Value: (indTotal + bulkTotal).toFixed(2) },
            { Info: 'Export Date', Value: new Date().toLocaleDateString() },
          ];
          const ws3 = XLSX.utils.json_to_sheet(summaryRows);
          ws3['!cols'] = [{ wch: 26 }, { wch: 28 }];
          XLSX.utils.book_append_sheet(workbook, ws3, 'Summary');

          const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          this.downloadFile(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `${fileName}.xlsx`,
          );
          this.showSuccess('Giving report exported successfully!');
          this.exporting = false;
        },
        error: () => {
          // Fallback: export without bulk sheet
          const indTotal = data.reduce((sum, t) => sum + (t.amount || 0), 0);
          const summaryRows = [
            { Info: 'Period', Value: `${startDate} to ${endDate}` },
            { Info: 'Total Transactions', Value: data.length },
            { Info: 'Total Amount (GHS)', Value: indTotal.toFixed(2) },
            { Info: 'Export Date', Value: new Date().toLocaleDateString() },
          ];
          const ws3 = XLSX.utils.json_to_sheet(summaryRows);
          ws3['!cols'] = [{ wch: 22 }, { wch: 28 }];
          XLSX.utils.book_append_sheet(workbook, ws3, 'Summary');
          const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          this.downloadFile(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `${fileName}.xlsx`,
          );
          this.showSuccess('Giving report exported (individual records only)!');
          this.exporting = false;
        },
      });
  }

  private exportGivingPDF(data: any[], fileName: string, startDate: string, endDate: string): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // Header
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Giving Transactions Report', pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    // Period strip
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 22, pageWidth, 10, 'F');
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Period: ${startDate} → ${endDate}`, pageWidth / 2, 29, { align: 'center' });

    // Stats strip
    const total = data.reduce((sum, t) => sum + (t.amount || 0), 0);
    const avg = data.length ? total / data.length : 0;
    doc.setFillColor(249, 250, 251);
    doc.rect(0, 32, pageWidth, 14, 'F');
    const stats = [
      `Transactions: ${data.length}`,
      `Total: GHS ${total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
      `Average: GHS ${avg.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
    ];
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const colW = pageWidth / stats.length;
    stats.forEach((s, i) => doc.text(s, colW * i + colW / 2, 41, { align: 'center' }));

    // Table
    autoTable(doc, {
      startY: 50,
      head: [['#', 'Date', 'Member', 'Member No.', 'Category', 'Amount', 'Currency', 'Method', 'Reference']],
      body: data.map((t: any, idx) => [
        idx + 1,
        t.transaction_date || '—',
        t.member ? `${t.member.first_name} ${t.member.last_name}` : 'Anonymous',
        t.member?.member_number || 'N/A',
        t.category?.name || 'General',
        `${(t.amount || 0).toFixed(2)}`,
        t.currency || '—',
        t.payment_method || '—',
        t.transaction_reference || '—',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [91, 33, 182], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 24 },
        2: { cellWidth: 36 },
        3: { cellWidth: 24 },
        4: { cellWidth: 28 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 18 },
        7: { cellWidth: 24 },
        8: { cellWidth: 30 },
      },
      didDrawPage: (d) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${d.pageNumber} of ${pageCount}  •  Churchman Church Management`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      },
    });

    this.downloadFile(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
    this.showSuccess('Giving report exported successfully!');
    this.exporting = false;
  }

  // ── Export: Pledges Report ───────────────────────────────────

  exportPledgesReport(): void {
    this.showPledgesExportModal = true;
  }

  exportPledgesAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showPledgesExportModal = false;
    const fileName = `pledges_report_${new Date().toISOString().split('T')[0]}`;

    this.financeService
      .getPledges(1, 10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          if (format === 'csv') this.exportPledgesCSV(data, fileName);
          else if (format === 'excel') this.exportPledgesExcel(data, fileName);
          else this.exportPledgesPDF(data, fileName);
          this.showSuccess('Pledges report exported successfully!');
          this.exporting = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to export pledges report';
          this.exporting = false;
        },
      });
  }

  private exportPledgesCSV(data: any[], fileName: string): void {
    const headers = ['Member', 'Category', 'Pledge Amount', 'Amount Paid', 'Balance', 'Currency', 'Pledge Date', 'Due Date', 'Status'];
    const rows = data.map((p: any) => [
      p.member ? `${p.member.first_name} ${p.member.last_name}` : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim() || 'Visitor',
      p.category?.name || 'General',
      p.pledge_amount, p.amount_paid, p.pledge_amount - p.amount_paid,
      p.currency, p.pledge_date, p.due_date || 'N/A',
      p.is_fulfilled ? 'Fulfilled' : 'Pending',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    this.downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileName}.csv`);
  }

  private exportPledgesExcel(data: any[], fileName: string): void {
    const rows = data.map((p: any) => ({
      Member: p.member ? `${p.member.first_name} ${p.member.last_name}` : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim() || 'Visitor',
      Category: p.category?.name || 'General',
      'Pledge Amount': p.pledge_amount,
      'Amount Paid': p.amount_paid,
      Balance: p.pledge_amount - p.amount_paid,
      Currency: p.currency,
      'Pledge Date': p.pledge_date,
      'Due Date': p.due_date || 'N/A',
      Status: p.is_fulfilled ? 'Fulfilled' : 'Pending',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pledges');

    const totalPledged = data.reduce((sum, p) => sum + (p.pledge_amount || 0), 0);
    const totalPaid = data.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
    const fulfilled = data.filter((p) => p.is_fulfilled).length;
    const summaryData = [
      { Info: 'Total Pledges', Value: data.length },
      { Info: 'Total Pledged (GHS)', Value: totalPledged.toFixed(2) },
      { Info: 'Total Paid (GHS)', Value: totalPaid.toFixed(2) },
      { Info: 'Outstanding (GHS)', Value: (totalPledged - totalPaid).toFixed(2) },
      { Info: 'Fulfilled', Value: fulfilled },
      { Info: 'Pending', Value: data.length - fulfilled },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadFile(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${fileName}.xlsx`,
    );
  }

  private exportPledgesPDF(data: any[], fileName: string): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Pledges Report', pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    const totalPledged = data.reduce((sum, p) => sum + (p.pledge_amount || 0), 0);
    const totalPaid = data.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
    const fulfilled = data.filter((p) => p.is_fulfilled).length;

    doc.setFillColor(245, 243, 255);
    doc.rect(0, 22, pageWidth, 14, 'F');
    const stats = [
      `Total Pledges: ${data.length}`,
      `Total Pledged: GHS ${totalPledged.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
      `Total Paid: GHS ${totalPaid.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
      `Outstanding: GHS ${(totalPledged - totalPaid).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
      `Fulfilled: ${fulfilled} / ${data.length}`,
    ];
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const colW = pageWidth / stats.length;
    stats.forEach((s, i) => doc.text(s, colW * i + colW / 2, 31, { align: 'center' }));

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Member', 'Category', 'Pledged', 'Paid', 'Balance', 'Currency', 'Pledge Date', 'Due Date', 'Status']],
      body: data.map((p: any, idx) => {
        const memberName = p.member
          ? `${p.member.first_name} ${p.member.last_name}`
          : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim() || 'Visitor';
        return [
          idx + 1, memberName, p.category?.name || 'General',
          (p.pledge_amount || 0).toFixed(2), (p.amount_paid || 0).toFixed(2),
          (p.pledge_amount - p.amount_paid).toFixed(2),
          p.currency || '—', p.pledge_date || '—', p.due_date || 'N/A',
          p.is_fulfilled ? 'Fulfilled' : 'Pending',
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [91, 33, 182], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 36 }, 2: { cellWidth: 26 },
        3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 }, 6: { halign: 'center', cellWidth: 16 },
        7: { cellWidth: 24 }, 8: { cellWidth: 24 }, 9: { halign: 'center', cellWidth: 20 },
      },
      didDrawPage: (d) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${d.pageNumber} of ${pageCount}  •  Churchman Church Management`,
          pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' },
        );
      },
    });

    this.downloadFile(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  // ── Export: Expenses Report (NEW) ────────────────────────────

  exportExpensesReport(): void {
    this.showExpensesExportModal = true;
  }

  exportExpensesAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showExpensesExportModal = false;
    const fileName = `expenses_report_${new Date().toISOString().split('T')[0]}`;

    this.financeService
      .getCategoryExpenses(1, 10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          if (format === 'csv') this.exportExpensesCSV(data, fileName);
          else if (format === 'excel') this.exportExpensesExcel(data, fileName);
          else this.exportExpensesPDF(data, fileName);
          this.showSuccess('Expenses report exported successfully!');
          this.exporting = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to export expenses report';
          this.exporting = false;
        },
      });
  }

  private exportExpensesCSV(data: any[], fileName: string): void {
    const headers = ['Date', 'Title', 'Category', 'Amount', 'Currency', 'Receipt Ref', 'Description'];
    const rows = data.map((e: any) => [
      e.expense_date, e.title, e.category_name || 'General',
      e.amount, e.currency, e.receipt_reference || 'N/A', e.description || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    this.downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileName}.csv`);
  }

  private exportExpensesExcel(data: any[], fileName: string): void {
    const rows = data.map((e: any) => ({
      Date: e.expense_date,
      Title: e.title,
      Category: e.category_name || 'General',
      Amount: e.amount,
      Currency: e.currency,
      'Receipt Ref': e.receipt_reference || 'N/A',
      Description: e.description || '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No expenses recorded' }]);
    worksheet['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 36 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');

    const total = data.reduce((sum, e) => sum + (e.amount || 0), 0);
    const summaryData = [
      { Info: 'Total Expense Records', Value: data.length },
      { Info: 'Total Amount (GHS)', Value: total.toFixed(2) },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadFile(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${fileName}.xlsx`,
    );
  }

  private exportExpensesPDF(data: any[], fileName: string): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Category Expenses Report', pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    const total = data.reduce((sum, e) => sum + (e.amount || 0), 0);
    doc.setFillColor(254, 242, 242);
    doc.rect(0, 22, pageWidth, 10, 'F');
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Total Records: ${data.length}   |   Total Expenses: GHS ${total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`,
      pageWidth / 2, 29, { align: 'center' },
    );

    autoTable(doc, {
      startY: 36,
      head: [['#', 'Date', 'Title', 'Category', 'Amount', 'Currency', 'Receipt Ref', 'Description']],
      body: data.map((e: any, idx) => [
        idx + 1,
        e.expense_date || '—',
        e.title || '—',
        e.category_name || 'General',
        `${(e.amount || 0).toFixed(2)}`,
        e.currency || '—',
        e.receipt_reference || '—',
        e.description || '—',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 24 },
        2: { cellWidth: 40 },
        3: { cellWidth: 28 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 18 },
        6: { cellWidth: 24 },
        7: { cellWidth: 44 },
      },
      didDrawPage: (d) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${d.pageNumber} of ${pageCount}  •  Churchman Church Management`,
          pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' },
        );
      },
    });

    this.downloadFile(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  // ── Shared utilities ─────────────────────────────────────────

  private showSuccess(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 3000);
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  goBack(): void { this.location.back(); }
}
