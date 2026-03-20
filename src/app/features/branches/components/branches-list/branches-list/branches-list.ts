// src/app/features/branches/components/branches-list/branches-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BranchesService } from '../../../services/branches';
import { Branch, BranchStatistics } from '../../../../../models/branch.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-branches-list',
  standalone: false,
  templateUrl: './branches-list.html',
  styleUrl: './branches-list.scss',
})
export class BranchesList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branches: Branch[] = [];
  statistics: BranchStatistics | null = null;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalBranches = 0;
  totalPages = 0;

  // Permissions
  canManageBranches = false;
  canViewBranches = false;

  showExportModal = false;
  exporting = false;

  constructor(
    private branchesService: BranchesService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadBranches();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canViewBranches =
      this.permissionService.isAdmin || this.permissionService.branches.view;

    this.canManageBranches =
      this.permissionService.isAdmin || this.permissionService.branches.manage;

    if (!this.canViewBranches) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadBranches(): void {
    this.loading = true;
    this.errorMessage = '';

    this.branchesService
      .getBranches(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.branches = data;
          this.totalBranches = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load branches';
          this.loading = false;
          console.error('Error loading branches:', error);
        },
      });
  }

  loadStatistics(): void {
    this.branchesService
      .getBranchStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        },
      });
  }

  // Navigation
  createBranch(): void {
    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to create branches';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/branches/create']);
  }

  viewBranch(branchId: string): void {
    this.router.navigate(['main/branches', branchId]);
  }

  editBranch(branchId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to edit branches';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/branches', branchId, 'edit']);
  }

  deleteBranch(branchId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageBranches) {
      this.errorMessage = 'You do not have permission to delete branches';
      this.scrollToTop();
      return;
    }

    const branch = this.branches.find((b) => b.id === branchId);
    if (!branch) return;

    const confirmMessage =
      branch.member_count > 0
        ? `This branch has ${branch.member_count} member${branch.member_count !== 1 ? 's' : ''}. Are you sure you want to delete it? This will not delete members.`
        : 'Are you sure you want to delete this branch?';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.branchesService
      .deleteBranch(branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Branch deleted successfully!';
          this.loadBranches();
          this.loadStatistics();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete branch';
          this.scrollToTop();
          console.error('Delete error:', error);
        },
      });
  }

  exportBranches(): void {
    if (this.branches.length === 0) {
      this.errorMessage = 'No branches to export';
      this.scrollToTop();
      return;
    }
    this.showExportModal = true;
  }

  exportAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showExportModal = false;

    this.branchesService
      .getBranches(1, 10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          const fileName = `branches_${new Date().toISOString().split('T')[0]}`;
          if (format === 'csv') this.exportCSV(data, fileName);
          else if (format === 'excel') this.exportExcel(data, fileName);
          else this.exportPDF(data, fileName);

          this.successMessage = 'Branches exported successfully!';
          setTimeout(() => (this.successMessage = ''), 3000);
          this.exporting = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to export branches';
          this.scrollToTop();
          this.exporting = false;
        },
      });
  }

  private exportCSV(data: any[], fileName: string): void {
    const headers = [
      'Branch Name',
      'Pastor/Leader',
      'City',
      'State/Region',
      'Country',
      'Phone',
      'Email',
      'Members',
      'Established Date',
      'Status',
      'Created Date',
    ];
    const rows = data.map((b) => [
      b.name || '',
      b.pastor_name || '',
      b.city || '',
      b.state || '',
      b.country || '',
      b.phone || '',
      b.email || '',
      b.member_count || 0,
      b.established_date
        ? new Date(b.established_date).toLocaleDateString()
        : '',
      b.is_active ? 'Active' : 'Inactive',
      b.created_at ? new Date(b.created_at).toLocaleDateString() : '',
    ]);
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');
    this.downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${fileName}.csv`,
    );
  }

  private exportExcel(data: any[], fileName: string): void {
    const rows = data.map((b) => ({
      'Branch Name': b.name || '',
      'Pastor/Leader': b.pastor_name || '',
      City: b.city || '',
      'State/Region': b.state || '',
      Country: b.country || '',
      Phone: b.phone || '',
      Email: b.email || '',
      Members: b.member_count || 0,
      'Established Date': b.established_date
        ? new Date(b.established_date).toLocaleDateString()
        : '',
      Status: b.is_active ? 'Active' : 'Inactive',
      'Created Date': b.created_at
        ? new Date(b.created_at).toLocaleDateString()
        : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 28 },
      { wch: 10 },
      { wch: 18 },
      { wch: 10 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Branches');

    // Summary sheet
    const active = data.filter((b) => b.is_active).length;
    const totalMembers = data.reduce(
      (sum, b) => sum + (b.member_count || 0),
      0,
    );
    const summaryData = [
      { Info: 'Total Branches', Value: data.length },
      { Info: 'Active Branches', Value: active },
      { Info: 'Inactive Branches', Value: data.length - active },
      { Info: 'Total Members', Value: totalMembers },
      {
        Info: 'Average Members/Branch',
        Value: data.length ? Math.round(totalMembers / data.length) : 0,
      },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 26 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private exportPDF(data: any[], fileName: string): void {
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

    // Header banner
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Branches Report', pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    // Stats row
    const active = data.filter((b) => b.is_active).length;
    const totalMembers = data.reduce(
      (sum, b) => sum + (b.member_count || 0),
      0,
    );
    const avgMembers = data.length ? Math.round(totalMembers / data.length) : 0;

    doc.setFillColor(245, 243, 255);
    doc.rect(0, 22, pageWidth, 14, 'F');
    const stats = [
      `Total Branches: ${data.length}`,
      `Active: ${active}`,
      `Inactive: ${data.length - active}`,
      `Total Members: ${totalMembers}`,
      `Avg Members/Branch: ${avgMembers}`,
    ];
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    const colW = pageWidth / stats.length;
    stats.forEach((s, i) =>
      doc.text(s, colW * i + colW / 2, 31, { align: 'center' }),
    );

    // Table
    autoTable(doc, {
      startY: 42,
      head: [
        [
          '#',
          'Branch Name',
          'Pastor/Leader',
          'City',
          'Phone',
          'Email',
          'Members',
          'Est. Date',
          'Status',
        ],
      ],
      body: data.map((b, idx) => [
        idx + 1,
        b.name || '—',
        b.pastor_name || '—',
        b.city ? `${b.city}${b.state ? ', ' + b.state : ''}` : '—',
        b.phone || '—',
        b.email || '—',
        b.member_count || 0,
        b.established_date ? new Date(b.established_date).getFullYear() : '—',
        b.is_active ? 'Active' : 'Inactive',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 40 },
        2: { cellWidth: 36 },
        3: { cellWidth: 30 },
        4: { cellWidth: 26 },
        5: { cellWidth: 46 },
        6: { halign: 'center', cellWidth: 18 },
        7: { halign: 'center', cellWidth: 18 },
        8: { halign: 'center', cellWidth: 18 },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 8) {
          const val = String(data.cell.raw).toLowerCase();
          if (val === 'active') {
            doc.setTextColor(6, 95, 70);
          } else {
            doc.setTextColor(153, 27, 27);
          }
        }
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

    this.downloadBlob(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBranches();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBranches();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
