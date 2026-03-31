import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PdfBrandingService } from '../../../core/services/pdf-branding.service';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface StudentFeeRow {
  studentName: string;
  studentNumber: string;
  feeItems: {
    feeName: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
    status: string;
  }[];
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  overallStatus: string;
}

export interface ClassFeeExportData {
  className: string;
  term: string;
  academicYear: string;
  students: StudentFeeRow[];
  grandTotalDue: number;
  grandTotalPaid: number;
  grandTotalBalance: number;
}

@Injectable({ providedIn: 'root' })
export class ClassFeeExportService {
  constructor(
    private branding: PdfBrandingService,
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId(): string {
    return this.authService.getChurchId() || '';
  }

  // ── Fetch data for a class ────────────────────────────────
  async fetchClassFeeData(
    classId: string,
    className: string,
    academicYear: string,
    term: string,
  ): Promise<ClassFeeExportData> {
    // Step 1: Get all student IDs in this class
    const { data: studentRows, error: studErr } = await this.supabase.client
      .from('students')
      .select('id')
      .eq('class_id', classId)
      .eq('church_id', this.churchId)
      .eq('is_active', true);

    if (studErr) throw studErr;

    const studentIds = (studentRows || []).map((s: any) => s.id);

    if (studentIds.length === 0) {
      return {
        className,
        term,
        academicYear,
        students: [],
        grandTotalDue: 0,
        grandTotalPaid: 0,
        grandTotalBalance: 0,
      };
    }

    // Step 2: Get all fee records for those students
    const { data: fees, error } = await this.supabase.client
      .from('student_fees')
      .select(
        '*, student:students(first_name, last_name, student_number), fee_structure:fee_structures(fee_name)',
      )
      .eq('church_id', this.churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .in('student_id', studentIds);

    if (error) throw error;

    // Group by student
    const map: { [sid: string]: StudentFeeRow } = {};
    (fees || []).forEach((fee: any) => {
      const sid = fee.student_id;
      const name =
        `${fee.student?.first_name || ''} ${fee.student?.last_name || ''}`.trim();
      if (!map[sid]) {
        map[sid] = {
          studentName: name,
          studentNumber: fee.student?.student_number || '',
          feeItems: [],
          totalDue: 0,
          totalPaid: 0,
          totalBalance: 0,
          overallStatus: 'paid',
        };
      }
      const balance = Number(fee.amount_due) - Number(fee.amount_paid);
      map[sid].feeItems.push({
        feeName: fee.fee_structure?.fee_name || 'Unknown Fee', // ← changed
        amountDue: Number(fee.amount_due),
        amountPaid: Number(fee.amount_paid),
        balance,
        status: fee.status,
      });
      map[sid].totalDue += Number(fee.amount_due);
      map[sid].totalPaid += Number(fee.amount_paid);
      map[sid].totalBalance += balance;
      if (fee.status === 'unpaid') map[sid].overallStatus = 'unpaid';
      else if (fee.status === 'partial' && map[sid].overallStatus !== 'unpaid')
        map[sid].overallStatus = 'partial';
    });

    const students = Object.values(map).sort((a, b) =>
      a.studentName.localeCompare(b.studentName),
    );

    return {
      className,
      term,
      academicYear,
      students,
      grandTotalDue: students.reduce((s, r) => s + r.totalDue, 0),
      grandTotalPaid: students.reduce((s, r) => s + r.totalPaid, 0),
      grandTotalBalance: students.reduce((s, r) => s + r.totalBalance, 0),
    };
  }

  // ── Fetch single student fee data ─────────────────────────
  async fetchStudentFeeData(
    studentId: string,
    academicYear: string,
    term: string,
  ): Promise<{ student: any; feeData: StudentFeeRow } | null> {
    const [studentRes, feesRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select('*, class:school_classes(*)')
        .eq('id', studentId)
        .single(),
      this.supabase.client
        .from('student_fees')
        .select('*, fee_structure:fee_structures(fee_name)')
        .eq('student_id', studentId)
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ]);

    if (studentRes.error) throw studentRes.error;

    const student = studentRes.data;
    const fees = feesRes.data || [];
    const name = `${student.first_name} ${student.last_name}`.trim();

    const feeData: StudentFeeRow = {
      studentName: name,
      studentNumber: student.student_number,
      feeItems: fees.map((f: any) => ({
        feeName: f.fee_structure?.fee_name || 'Unknown Fee', // ← changed
        amountDue: Number(f.amount_due),
        amountPaid: Number(f.amount_paid),
        balance: Number(f.amount_due) - Number(f.amount_paid),
        status: f.status,
      })),
      totalDue: fees.reduce((s: number, f: any) => s + Number(f.amount_due), 0),
      totalPaid: fees.reduce(
        (s: number, f: any) => s + Number(f.amount_paid),
        0,
      ),
      totalBalance: fees.reduce(
        (s: number, f: any) => s + Number(f.amount_due) - Number(f.amount_paid),
        0,
      ),
      overallStatus: 'paid',
    };

    return { student, feeData };
  }

  // ── Export class as PDF ───────────────────────────────────
  async exportClassPDF(data: ClassFeeExportData): Promise<void> {
    const b = await this.branding.getBranding();
    const doc = new jsPDF({
      orientation: 'landscape',
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
    doc.rect(0, 0, pw, 26, 'F');
    if (b.logoBase64) {
      try {
        doc.addImage(
          b.logoBase64,
          b.logoMimeType.replace('image/', '').toUpperCase(),
          14,
          4,
          17,
          17,
        );
      } catch {
        /* skip */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(b.name, 36, 13);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fee Statement — ${data.className}`, pw / 2, 13, {
      align: 'center',
    });
    doc.setFontSize(8);
    doc.text(
      `${data.term}  |  ${data.academicYear}  |  Generated: ${today}`,
      pw - 14,
      13,
      { align: 'right' },
    );
    if (b.tagline) {
      doc.setFontSize(8);
      doc.text(b.tagline, 36, 20);
    }

    // Stats row
    doc.setFillColor(238, 242, 255);
    doc.rect(0, 26, pw, 14, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const stats = [
      `Students: ${data.students.length}`,
      `Total Due: ${this.fmt(data.grandTotalDue)}`,
      `Total Paid: ${this.fmt(data.grandTotalPaid)}`,
      `Outstanding: ${this.fmt(data.grandTotalBalance)}`,
      `Collection Rate: ${data.grandTotalDue > 0 ? Math.round((data.grandTotalPaid / data.grandTotalDue) * 100) : 0}%`,
    ];
    const cw = pw / stats.length;
    stats.forEach((s, i) =>
      doc.text(s, cw * i + cw / 2, 35, { align: 'center' }),
    );

    // Table
    autoTable(doc, {
      startY: 44,
      head: [
        [
          '#',
          'Student Name',
          'Stud. No.',
          'Fee Item',
          'Amount Due',
          'Amount Paid',
          'Balance',
          'Status',
        ],
      ],
      body: data.students.flatMap((s, i) =>
        s.feeItems.length > 0
          ? s.feeItems.map((fi, j) => [
              j === 0 ? i + 1 : '',
              j === 0 ? s.studentName : '',
              j === 0 ? s.studentNumber : '',
              fi.feeName,
              this.fmt(fi.amountDue),
              this.fmt(fi.amountPaid),
              this.fmt(fi.balance),
              fi.status.charAt(0).toUpperCase() + fi.status.slice(1),
            ])
          : [
              [
                i + 1,
                s.studentName,
                s.studentNumber,
                '—',
                this.fmt(0),
                this.fmt(0),
                this.fmt(0),
                'No fees',
              ],
            ],
      ),
      foot: [
        [
          '',
          'GRAND TOTAL',
          '',
          '',
          this.fmt(data.grandTotalDue),
          this.fmt(data.grandTotalPaid),
          this.fmt(data.grandTotalBalance),
          '',
        ],
      ],
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [255, 247, 237],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', textColor: [220, 38, 38] },
        7: { halign: 'center' },
      },
      didDrawPage: (d) => {
        const count = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${d.pageNumber} of ${count}  •  ${b.name}  •  ${data.term} ${data.academicYear}`,
          pw / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      },
    });

    this.download(
      doc,
      `fee_statement_${data.className.replace(/\s+/g, '_')}_${data.term.replace(' ', '_')}`,
    );
  }

  // ── Export class as XLSX ──────────────────────────────────
  async exportClassXLSX(data: ClassFeeExportData): Promise<void> {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Detailed breakdown
    const rows: any[] = [];
    data.students.forEach((s, i) => {
      s.feeItems.forEach((fi, j) => {
        rows.push({
          '#': j === 0 ? i + 1 : '',
          'Student Name': j === 0 ? s.studentName : '',
          'Student No.': j === 0 ? s.studentNumber : '',
          'Fee Item': fi.feeName,
          'Amount Due (GHS)': fi.amountDue,
          'Amount Paid (GHS)': fi.amountPaid,
          'Balance (GHS)': fi.balance,
          Status: fi.status,
        });
      });
      if (s.feeItems.length > 1) {
        rows.push({
          '#': '',
          'Student Name': `SUBTOTAL — ${s.studentName}`,
          'Student No.': '',
          'Fee Item': '',
          'Amount Due (GHS)': s.totalDue,
          'Amount Paid (GHS)': s.totalPaid,
          'Balance (GHS)': s.totalBalance,
          Status: s.overallStatus,
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 4 },
      { wch: 24 },
      { wch: 14 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Detailed');

    // Sheet 2: Student summary
    const summaryRows = data.students.map((s, i) => ({
      '#': i + 1,
      'Student Name': s.studentName,
      'Student No.': s.studentNumber,
      'Total Due (GHS)': s.totalDue,
      'Total Paid (GHS)': s.totalPaid,
      'Balance (GHS)': s.totalBalance,
      Status: s.overallStatus,
    }));
    summaryRows.push({
      '#': '' as any,
      'Student Name': 'GRAND TOTAL',
      'Student No.': '',
      'Total Due (GHS)': data.grandTotalDue,
      'Total Paid (GHS)': data.grandTotalPaid,
      'Balance (GHS)': data.grandTotalBalance,
      Status: '',
    });

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [
      { wch: 4 },
      { wch: 24 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.triggerDownload(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `fee_statement_${data.className.replace(/\s+/g, '_')}_${data.term.replace(' ', '_')}.xlsx`,
    );
  }

  // ── Export class as CSV ───────────────────────────────────
  exportClassCSV(data: ClassFeeExportData): void {
    const esc = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') ? `"${s}"` : s;
    };
    const headers = [
      '#',
      'Student Name',
      'Student No.',
      'Fee Item',
      'Amount Due',
      'Amount Paid',
      'Balance',
      'Status',
    ];
    const rows: string[][] = [];
    data.students.forEach((s, i) => {
      s.feeItems.forEach((fi, j) => {
        rows.push([
          j === 0 ? String(i + 1) : '',
          esc(j === 0 ? s.studentName : ''),
          esc(j === 0 ? s.studentNumber : ''),
          esc(fi.feeName),
          fi.amountDue.toFixed(2),
          fi.amountPaid.toFixed(2),
          fi.balance.toFixed(2),
          fi.status,
        ]);
      });
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `fee_statement_${data.className.replace(/\s+/g, '_')}_${data.term.replace(' ', '_')}.csv`,
    );
  }

  // ── Export single student PDF ─────────────────────────────
  async exportStudentPDF(
    studentId: string,
    academicYear: string,
    term: string,
  ): Promise<void> {
    const result = await this.fetchStudentFeeData(
      studentId,
      academicYear,
      term,
    );
    if (!result) return;
    const { student, feeData } = result;
    const b = await this.branding.getBranding();

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

    // Header
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pw, 30, 'F');
    if (b.logoBase64) {
      try {
        doc.addImage(
          b.logoBase64,
          b.logoMimeType.replace('image/', '').toUpperCase(),
          14,
          5,
          18,
          18,
        );
      } catch {
        /* skip */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text(b.name, 36, 14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Student Fee Statement', 36, 21);
    if (b.tagline) {
      doc.setFontSize(8);
      doc.text(b.tagline, 36, 27);
    }
    doc.setFontSize(8);
    doc.text(today, pw - 14, 21, { align: 'right' });

    // Student info block
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 36, pw - 28, 34, 3, 3, 'F');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(feeData.studentName, 20, 46);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Student No: ${feeData.studentNumber}`, 20, 53);
    doc.text(`Class: ${student.class?.name || '—'}`, 20, 59);
    doc.text(`Term: ${term}  |  Academic Year: ${academicYear}`, 20, 65);

    // Status badge
    const statusColors: Record<string, [number, number, number]> = {
      paid: [6, 95, 70],
      partial: [146, 64, 14],
      unpaid: [153, 27, 27],
    };
    const statusBg: Record<string, [number, number, number]> = {
      paid: [209, 250, 229],
      partial: [254, 243, 199],
      unpaid: [254, 226, 226],
    };
    const st = feeData.overallStatus;
    doc.setFillColor(...(statusBg[st] || statusBg['unpaid']));
    doc.roundedRect(pw - 50, 38, 36, 12, 3, 3, 'F');
    doc.setTextColor(...(statusColors[st] || statusColors['unpaid']));
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(st.charAt(0).toUpperCase() + st.slice(1), pw - 32, 46, {
      align: 'center',
    });

    // Summary boxes
    const boxes = [
      {
        label: 'Total Fees Due',
        value: this.fmt(feeData.totalDue),
        color: [238, 242, 255] as [number, number, number],
        text: [79, 70, 229] as [number, number, number],
      },
      {
        label: 'Total Paid',
        value: this.fmt(feeData.totalPaid),
        color: [209, 250, 229] as [number, number, number],
        text: [6, 95, 70] as [number, number, number],
      },
      {
        label: 'Outstanding Balance',
        value: this.fmt(feeData.totalBalance),
        color:
          feeData.totalBalance > 0
            ? ([254, 226, 226] as [number, number, number])
            : ([209, 250, 229] as [number, number, number]),
        text:
          feeData.totalBalance > 0
            ? ([153, 27, 27] as [number, number, number])
            : ([6, 95, 70] as [number, number, number]),
      },
    ];
    const bw = (pw - 28 - 12) / 3;
    boxes.forEach((box, i) => {
      const x = 14 + i * (bw + 6);
      doc.setFillColor(...box.color);
      doc.roundedRect(x, 76, bw, 24, 3, 3, 'F');
      doc.setTextColor(...box.text);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(box.label, x + bw / 2, 84, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(box.value, x + bw / 2, 94, { align: 'center' });
    });

    // Fee breakdown table
    autoTable(doc, {
      startY: 108,
      head: [['Fee Item', 'Amount Due', 'Amount Paid', 'Balance', 'Status']],
      body:
        feeData.feeItems.length > 0
          ? feeData.feeItems.map((fi) => [
              fi.feeName,
              this.fmt(fi.amountDue),
              this.fmt(fi.amountPaid),
              this.fmt(fi.balance),
              fi.status.charAt(0).toUpperCase() + fi.status.slice(1),
            ])
          : [['No fees assigned for this term', '', '', '', '']],
      foot:
        feeData.feeItems.length > 0
          ? [
              [
                'TOTAL',
                this.fmt(feeData.totalDue),
                this.fmt(feeData.totalPaid),
                this.fmt(feeData.totalBalance),
                '',
              ],
            ]
          : undefined,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [255, 247, 237],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', textColor: [220, 38, 38] },
        4: { halign: 'center' },
      },
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${b.name}${b.address ? '  •  ' + b.address : ''}${b.phone ? '  •  ' + b.phone : ''}`,
      pw / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' },
    );
    doc.text(
      'This is an official fee statement. Please keep it for your records.',
      pw / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' },
    );

    this.download(
      doc,
      `fee_statement_${feeData.studentName.replace(/\s+/g, '_')}_${term.replace(' ', '_')}`,
    );
  }

  // ── Helpers ──────────────────────────────────────────────
  private fmt(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      currencyDisplay: 'code',
    }).format(amount || 0);
  }

  private download(doc: jsPDF, name: string): void {
    this.triggerDownload(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${name}.pdf`,
    );
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
