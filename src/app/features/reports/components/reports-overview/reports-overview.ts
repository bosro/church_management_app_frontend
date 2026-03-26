import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../services/school.service';
import { PermissionService } from '../../../../core/services/permission.service';
import {
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../models/school.model';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../core/services/pdf-branding.service';

@Component({
  selector: 'app-reports-overview',
  standalone: false,
  templateUrl: './reports-overview.html',
  styleUrl: './reports-overview.scss',
})
export class ReportsOverview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  statistics: any = null;
  loading = true;
  errorMessage = '';

  currentAcademicYear = currentAcademicYear();
  currentTerm = TERMS[0];
  terms = TERMS;
  academicYears: string[] = generateAcademicYears();

  exporting = false;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private pdfBranding: PdfBrandingService,
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStatistics(): void {
    this.loading = true;
    this.schoolService
      .getSchoolStatistics(this.currentAcademicYear, this.currentTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
        },
      });
  }

  onTermChange(): void {
    this.loadStatistics();
  }

  onYearChange(): void {
    this.loadStatistics();
  }

  // ── Navigation ───────────────────────────────────────────

  goToStudents(): void {
    this.router.navigate(['main/reports/students']);
  }
  goToClasses(): void {
    this.router.navigate(['main/reports/classes']);
  }
  goToFeeStructures(): void {
    this.router.navigate(['main/reports/fees/structures']);
  }
  goToStudentFees(): void {
    this.router.navigate(['main/reports/fees/students']);
  }
  goToFeeReport(): void {
    this.router.navigate(['main/reports/fees/report']);
  }
  goToExams(): void {
    this.router.navigate(['main/reports/exams']);
  }
  goToGrading(): void {
    this.router.navigate(['main/reports/settings/grading']);
  }
  goToSubjects(): void {
    this.router.navigate(['main/reports/settings/subjects']);
  }

  // ── Helpers ──────────────────────────────────────────────

  getCollectionRate(): number {
    if (!this.statistics || this.statistics.total_fees_due === 0) return 0;
    return Math.round(
      (this.statistics.total_fees_paid / this.statistics.total_fees_due) * 100,
    );
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  private formatCurrencyPDF(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      currencyDisplay: 'code',
    }).format(amount || 0);
  }

  // ── Export summary PDF ────────────────────────────────────

  async exportSummaryPDF(): Promise<void> {
    const branding = await this.pdfBranding.getBranding();
    if (!this.statistics) return;
    this.exporting = true;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pw = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      // Header banner
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pw, 32, 'F');
      if (branding.logoBase64) {
        try {
          doc.addImage(
            branding.logoBase64,
            branding.logoMimeType.replace('image/', '').toUpperCase(),
            14,
            4,
            18,
            18,
          );
        } catch {
          /* skip */
        }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(branding.name, 36, 14);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('School Reports — Overview', 14, 22);
      doc.setFontSize(9);
      doc.text(`Generated: ${today}`, pw - 14, 22, { align: 'right' });

      // Term & Year pill
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(14, 38, pw - 28, 14, 3, 3, 'F');
      doc.setTextColor(79, 70, 229);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `${this.currentTerm}  |  Academic Year ${this.currentAcademicYear}`,
        pw / 2,
        47,
        { align: 'center' },
      );

      // Stats boxes
      const stats = [
        {
          label: 'Total Students',
          value: String(this.statistics.total_students),
          bg: [221, 214, 254] as [number, number, number],
          text: [124, 58, 237] as [number, number, number],
        },
        {
          label: 'Classes',
          value: String(this.statistics.total_classes),
          bg: [209, 250, 229] as [number, number, number],
          text: [16, 185, 129] as [number, number, number],
        },
        {
          label: 'Total Fees Due',
          value: this.formatCurrencyPDF(this.statistics.total_fees_due),
          bg: [219, 234, 254] as [number, number, number],
          text: [59, 130, 246] as [number, number, number],
        },
        {
          label: 'Fees Collected',
          value: this.formatCurrencyPDF(this.statistics.total_fees_paid),
          bg: [209, 250, 229] as [number, number, number],
          text: [16, 185, 129] as [number, number, number],
        },
        {
          label: 'Outstanding',
          value: this.formatCurrencyPDF(this.statistics.total_outstanding),
          bg: [254, 226, 226] as [number, number, number],
          text: [239, 68, 68] as [number, number, number],
        },
        {
          label: 'Collection Rate',
          value: `${this.getCollectionRate()}%`,
          bg: [254, 243, 199] as [number, number, number],
          text: [245, 158, 11] as [number, number, number],
        },
      ];

      const cols = 3;
      const boxW = (pw - 28 - (cols - 1) * 6) / cols;
      const boxH = 24;
      const startY = 60;

      stats.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 14 + col * (boxW + 6);
        const y = startY + row * (boxH + 8);
        doc.setFillColor(...s.bg);
        doc.roundedRect(x, y, boxW, boxH, 3, 3, 'F');
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(s.label, x + 8, y + 8);
        doc.setTextColor(...s.text);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(s.value, x + 8, y + 18);
      });

      // Progress section
      const progressY = startY + 2 * (boxH + 8) + 12;
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(14, progressY, pw - 28, 36, 3, 3, 'F');
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Fee Collection Progress', 22, progressY + 10);
      doc.setTextColor(16, 185, 129);
      doc.setFontSize(12);
      doc.text(`${this.getCollectionRate()}%`, pw - 22, progressY + 10, {
        align: 'right',
      });

      const barX = 22,
        barY = progressY + 16,
        barW = pw - 44,
        barH = 6;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(barX, barY, barW, barH, 3, 3, 'F');
      const fillW = Math.max(4, barW * (this.getCollectionRate() / 100));
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(barX, barY, fillW, barH, 3, 3, 'F');

      const legendY = progressY + 28;
      [
        {
          label: `Paid: ${this.statistics.paid_count}`,
          color: [16, 185, 129] as [number, number, number],
        },
        {
          label: `Partial: ${this.statistics.partial_count}`,
          color: [245, 158, 11] as [number, number, number],
        },
        {
          label: `Unpaid: ${this.statistics.unpaid_count}`,
          color: [239, 68, 68] as [number, number, number],
        },
      ].forEach((item, i) => {
        const lx = 22 + i * 60;
        doc.setFillColor(...item.color);
        doc.circle(lx + 3, legendY + 1.5, 2, 'F');
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label, lx + 8, legendY + 3);
      });

      // Table
      autoTable(doc, {
        startY: progressY + 48,
        head: [['Metric', 'Count / Amount']],
        body: [
          ['Total Students', String(this.statistics.total_students)],
          ['Total Classes', String(this.statistics.total_classes)],
          [
            'Total Fees Due',
            this.formatCurrencyPDF(this.statistics.total_fees_due),
          ],
          [
            'Total Fees Collected',
            this.formatCurrencyPDF(this.statistics.total_fees_paid),
          ],
          [
            'Total Outstanding',
            this.formatCurrencyPDF(this.statistics.total_outstanding),
          ],
          ['Fully Paid Students', String(this.statistics.paid_count)],
          ['Partial Payment Students', String(this.statistics.partial_count)],
          ['Unpaid Students', String(this.statistics.unpaid_count)],
          ['Collection Rate', `${this.getCollectionRate()}%`],
        ],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${branding.name}  •  Generated automatically`,
        pw / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );

      const fileName = `school_report_${this.currentTerm.replace(' ', '_')}_${this.currentAcademicYear.replace('/', '-')}.pdf`;
      const blob = new Blob([doc.output('arraybuffer')], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } finally {
      this.exporting = false;
    }
  }
}
