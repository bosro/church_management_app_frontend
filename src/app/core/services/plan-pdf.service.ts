// src/app/core/services/plan-pdf.service.ts
// Generates a clean PDF of one subscription tier (or a comparison of all tiers)
// that the super admin can send to a church on request.
import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SubscriptionPlan } from './subscription.service';

const PURPLE: [number, number, number] = [91, 33, 182];
const LIGHT: [number, number, number] = [245, 243, 255];
const GREY: [number, number, number] = [107, 114, 128];

@Injectable({ providedIn: 'root' })
export class PlanPdfService {
  private money(n: number): string {
    return `GHS ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  private limit(v: number | null | undefined): string {
    return v === null || v === undefined ? 'Unlimited' : v.toLocaleString('en-GH');
  }
  private yn(v: boolean | undefined): string {
    return v ? 'Included' : 'Not included';
  }
  private sms(p: SubscriptionPlan): string {
    if (!p.can_send_communications) return 'Not included';
    if (p.sms_monthly_limit === null || p.sms_monthly_limit === undefined) return 'Unlimited SMS + Email';
    return `${p.sms_monthly_limit.toLocaleString('en-GH')} SMS / month + Email`;
  }
  private extras(p: SubscriptionPlan): string[] {
    const f = p.plan_features || [];
    const out: string[] = [];
    if (f.includes('reports')) out.push('School & reports module');
    if (f.includes('voting')) out.push('Voting / elections');
    if (f.includes('job_hub')) out.push('Job Hub');
    return out;
  }
  private yearlySaving(p: SubscriptionPlan): { perMonth: number; saved: number; pct: number } {
    const full = p.price_monthly * 12;
    return {
      perMonth: p.price_yearly / 12,
      saved: Math.max(0, full - p.price_yearly),
      pct: full > 0 ? Math.round(((full - p.price_yearly) / full) * 100) : 0,
    };
  }

  private header(doc: jsPDF, title: string, subtitle: string): number {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, w, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Churchman', 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Church Management Platform', 14, 22);
    doc.setFontSize(9);
    doc.text(`Issued ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, w - 14, 15, { align: 'right' });

    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(title, 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GREY);
    if (subtitle) doc.text(subtitle, 14, 57);
    return 66;
  }

  private footer(doc: jsPDF): void {
    const pages = doc.getNumberOfPages();
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(229, 231, 235);
      doc.line(14, h - 18, w - 14, h - 18);
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text('All prices in Ghana Cedis (GHS). Payment is a one-time charge per period; plans do not renew automatically.', 14, h - 12);
      doc.text(`Page ${i} of ${pages}`, w - 14, h - 12, { align: 'right' });
    }
  }

  /** One tier: pricing, limits, features */
  exportPlan(plan: SubscriptionPlan): void {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = this.header(doc, `${plan.name} Plan`, plan.tagline || 'Subscription plan details');
    const free = plan.price_monthly === 0;
    const y1 = this.yearlySaving(plan);

    // Pricing
    autoTable(doc, {
      startY: y,
      head: [['Pricing', '']],
      body: free
        ? [['Price', 'Free forever']]
        : [
            ['Monthly billing', `${this.money(plan.price_monthly)} per month`],
            ['Yearly billing', `${this.money(plan.price_yearly)} per year  (${this.money(Math.round(y1.perMonth * 100) / 100)} per month)`],
            ['Yearly saving', y1.saved > 0 ? `Save ${this.money(y1.saved)} (${y1.pct}%) compared with paying monthly` : '—'],
          ],
      theme: 'grid',
      headStyles: { fillColor: PURPLE },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Limits
    autoTable(doc, {
      startY: y,
      head: [['Limits', '']],
      body: [
        ['Members', this.limit(plan.max_members)],
        ['Branches', this.limit(plan.max_branches)],
        ['Staff / admin users', this.limit(plan.max_users)],
        ['Active events', this.limit(plan.max_events)],
        ['Forms', this.limit(plan.max_forms)],
        ['Departments / ministries', this.limit(plan.max_ministries)],
      ],
      theme: 'grid',
      headStyles: { fillColor: PURPLE },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Features
    const features: string[][] = [
      ['Data export (Excel / PDF)', this.yn(plan.can_export)],
      ['SMS & email communications', this.sms(plan)],
      ['Advanced reports', this.yn(plan.can_use_reports)],
      ['Custom branding', this.yn(plan.can_custom_branding)],
      ['Ad-free experience', this.yn(plan.can_remove_ads)],
      ['Support', plan.support_level || 'Standard'],
      ...this.extras(plan).map((e) => [e, 'Included']),
    ];
    autoTable(doc, {
      startY: y,
      head: [['Features', '']],
      body: features,
      theme: 'grid',
      headStyles: { fillColor: PURPLE },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'Not included') {
          d.cell.styles.textColor = [156, 163, 175];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(
      'Plans start when payment is confirmed and run for the period paid. You are reminded before your plan ends,\nand keep access for a short grace period after expiry. Your data is never deleted if a plan lapses.',
      14, y,
    );

    this.footer(doc);
    doc.save(`Churchman-${plan.name.replace(/\s+/g, '-')}-plan.pdf`);
  }

  /** All active tiers side by side */
  exportComparison(plans: SubscriptionPlan[]): void {
    const sorted = [...plans].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.price_monthly - b.price_monthly);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const y = this.header(doc, 'Plans & Pricing', 'Choose the Churchman plan that fits your church');

    const head = [['', ...sorted.map((p) => p.name)]];
    const row = (label: string, f: (p: SubscriptionPlan) => string) => [label, ...sorted.map(f)];
    const body = [
      row('Monthly price', (p) => (p.price_monthly === 0 ? 'Free' : this.money(p.price_monthly))),
      row('Yearly price', (p) => (p.price_monthly === 0 ? '—' : `${this.money(p.price_yearly)}  (${this.money(Math.round((p.price_yearly / 12) * 100) / 100)}/mo)`)),
      row('Yearly saving', (p) => { const s = this.yearlySaving(p); return p.price_monthly === 0 || s.saved <= 0 ? '—' : `${this.money(s.saved)} (${s.pct}%)`; }),
      row('Members', (p) => this.limit(p.max_members)),
      row('Branches', (p) => this.limit(p.max_branches)),
      row('Staff / admin users', (p) => this.limit(p.max_users)),
      row('Active events', (p) => this.limit(p.max_events)),
      row('Forms', (p) => this.limit(p.max_forms)),
      row('Departments', (p) => this.limit(p.max_ministries)),
      row('Data export', (p) => this.yn(p.can_export)),
      row('SMS & email', (p) => this.sms(p)),
      row('Advanced reports', (p) => this.yn(p.can_use_reports)),
      row('Custom branding', (p) => this.yn(p.can_custom_branding)),
      row('Ad-free', (p) => this.yn(p.can_remove_ads)),
      row('Voting & Job Hub', (p) => ((p.plan_features || []).includes('voting') ? 'Included' : 'Not included')),
      row('Support', (p) => p.support_level || 'Standard'),
    ];

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: PURPLE, halign: 'center' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index > 0) {
          d.cell.styles.halign = 'center';
          if (d.cell.raw === 'Not included') d.cell.styles.textColor = [156, 163, 175];
        }
      },
    });

    this.footer(doc);
    doc.save('Churchman-plans-and-pricing.pdf');
  }
}
