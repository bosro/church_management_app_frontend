// src/app/features/finance/components/finance-reports/finance-reports.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  FinanceService,
  GivingStatistics,
  TopGiver,
} from '../../services/finance.service';
import { Router } from '@angular/router';
import { PermissionService } from '../../../../core/services/permission.service';
import { Location } from '@angular/common';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-finance-reports',
  standalone: false,
  templateUrl: './finance-reports.html',
  styleUrl: './finance-reports.scss',
})
export class FinanceReports implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  statistics: GivingStatistics | null = null;
  topGivers: TopGiver[] = [];
  errorMessage = '';
  successMessage = '';

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  // Date filters for exports
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');

  // Permissions
  canViewFinance = false;

  showGivingExportModal = false;
  showPledgesExportModal = false;
  exporting = false;

  constructor(
    private financeService: FinanceService,
    private router: Router,
    public permissionService: PermissionService,
    private location: Location,
  ) {
    // Generate year options (current year and 9 years back)
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      this.years.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canViewFinance =
      this.permissionService.isAdmin ||
      this.permissionService.finance.view ||
      this.permissionService.finance.reports;

    if (!this.canViewFinance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadReports(): void {
    this.loading = true;
    this.errorMessage = '';

    // Load statistics
    this.financeService
      .getGivingStatistics(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
          console.error('Error loading statistics:', error);
        },
      });

    // Load top givers
    this.financeService
      .getTopGivers(10, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => {
          this.topGivers = givers;
        },
        error: (error) => {
          console.error('Error loading top givers:', error);
        },
      });
  }

  onYearChange(): void {
    this.loadReports();
  }

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
            // Re-fetch raw data for Excel/PDF
            this.financeService
              .getGivingTransactions(1, 10000, { startDate, endDate })
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: ({ data }) => {
                  if (format === 'excel')
                    this.exportGivingExcel(data, fileName);
                  else this.exportGivingPDF(data, fileName, startDate, endDate);
                  this.showSuccess('Giving report exported successfully!');
                  this.exporting = false;
                },
                error: (err) => {
                  this.errorMessage =
                    'Export failed: ' + (err.message || 'Unknown error');
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

  private exportGivingExcel(data: any[], fileName: string): void {
    const rows = data.map((t: any) => ({
      Date: t.transaction_date || '',
      Member: t.member
        ? `${t.member.first_name} ${t.member.last_name}`
        : 'Anonymous',
      'Member Number': t.member?.member_number || 'N/A',
      Category: t.category?.name || 'General',
      Amount: t.amount,
      Currency: t.currency,
      'Payment Method': t.payment_method,
      Reference: t.transaction_reference || '',
      Notes: t.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 18 },
      { wch: 20 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Giving Transactions');

    // Summary sheet
    const total = data.reduce((sum, t) => sum + (t.amount || 0), 0);
    const summaryData = [
      {
        Info: 'Period',
        Value: `${this.startDateControl.value} to ${this.endDateControl.value}`,
      },
      { Info: 'Total Transactions', Value: data.length },
      { Info: 'Total Amount (GHS)', Value: total.toFixed(2) },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadFile(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private exportGivingPDF(
    data: any[],
    fileName: string,
    startDate: string,
    endDate: string,
  ): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Header
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Giving Transactions Report', pageWidth / 2, 14, {
      align: 'center',
    });
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    // Period banner
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 22, pageWidth, 10, 'F');
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Period: ${startDate} → ${endDate}`, pageWidth / 2, 29, {
      align: 'center',
    });

    // Stats row
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
    stats.forEach((s, i) =>
      doc.text(s, colW * i + colW / 2, 41, { align: 'center' }),
    );

    autoTable(doc, {
      startY: 50,
      head: [
        [
          '#',
          'Date',
          'Member',
          'Member No.',
          'Category',
          'Amount',
          'Currency',
          'Method',
          'Reference',
        ],
      ],
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
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
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
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  Churchman Church Management`,
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
  }

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
    const headers = [
      'Member',
      'Category',
      'Pledge Amount',
      'Amount Paid',
      'Balance',
      'Currency',
      'Pledge Date',
      'Due Date',
      'Status',
    ];
    const rows = data.map((p: any) => [
      p.member
        ? `${p.member.first_name} ${p.member.last_name}`
        : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim(),
      p.category?.name || 'General',
      p.pledge_amount,
      p.amount_paid,
      p.pledge_amount - p.amount_paid,
      p.currency,
      p.pledge_date,
      p.due_date || 'N/A',
      p.is_fulfilled ? 'Fulfilled' : 'Pending',
    ]);
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
    ].join('\n');
    this.downloadFile(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${fileName}.csv`,
    );
  }

  private exportPledgesExcel(data: any[], fileName: string): void {
    const rows = data.map((p: any) => ({
      Member: p.member
        ? `${p.member.first_name} ${p.member.last_name}`
        : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim(),
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
    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pledges');

    const totalPledged = data.reduce(
      (sum, p) => sum + (p.pledge_amount || 0),
      0,
    );
    const totalPaid = data.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
    const fulfilled = data.filter((p) => p.is_fulfilled).length;

    const summaryData = [
      { Info: 'Total Pledges', Value: data.length },
      { Info: 'Total Pledged (GHS)', Value: totalPledged.toFixed(2) },
      { Info: 'Total Paid (GHS)', Value: totalPaid.toFixed(2) },
      {
        Info: 'Outstanding (GHS)',
        Value: (totalPledged - totalPaid).toFixed(2),
      },
      { Info: 'Fulfilled', Value: fulfilled },
      { Info: 'Pending', Value: data.length - fulfilled },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadFile(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private exportPledgesPDF(data: any[], fileName: string): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Header
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

    // Stats row
    const totalPledged = data.reduce(
      (sum, p) => sum + (p.pledge_amount || 0),
      0,
    );
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
    stats.forEach((s, i) =>
      doc.text(s, colW * i + colW / 2, 31, { align: 'center' }),
    );

    autoTable(doc, {
      startY: 42,
      head: [
        [
          '#',
          'Member',
          'Category',
          'Pledged',
          'Paid',
          'Balance',
          'Currency',
          'Pledge Date',
          'Due Date',
          'Status',
        ],
      ],
      body: data.map((p: any, idx) => {
        const memberName = p.member
          ? `${p.member.first_name} ${p.member.last_name}`
          : `${p.visitor_first_name || ''} ${p.visitor_last_name || ''}`.trim() ||
            'Visitor';
        return [
          idx + 1,
          memberName,
          p.category?.name || 'General',
          (p.pledge_amount || 0).toFixed(2),
          (p.amount_paid || 0).toFixed(2),
          (p.pledge_amount - p.amount_paid).toFixed(2),
          p.currency || '—',
          p.pledge_date || '—',
          p.due_date || 'N/A',
          p.is_fulfilled ? 'Fulfilled' : 'Pending',
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 36 },
        2: { cellWidth: 26 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 16 },
        7: { cellWidth: 24 },
        8: { cellWidth: 24 },
        9: { halign: 'center', cellWidth: 20 },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  Churchman Church Management`,
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
  }

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
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
    }).format(amount || 0);
  }

  goBack(): void {
    this.location.back();
  }
}
