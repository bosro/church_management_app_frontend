// ══════════════════════════════════════════════════════════════════════
// FILE: receipts-list.ts
// Path: src/app/features/reports/components/fees/receipts-list/receipts-list.ts
// ══════════════════════════════════════════════════════════════════════

import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  FeePayment,
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../../models/school.model';
import { Location } from '@angular/common';
import { SchoolFilterService } from '../../../services/school-filter.service';

@Component({
  selector: 'app-receipts-list',
  standalone: false,
  templateUrl: './receipts-list.html',
  styleUrl: './receipts-list.scss',
})
export class ReceiptsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  payments: FeePayment[] = [];
  loading = false;
  errorMessage = '';

  // Filters
  searchControl = new FormControl('');
  selectedTerm = '';
  selectedYear = ''; 
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalCount = 0;
  get totalPages() {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private location: Location,
    private route: ActivatedRoute,
    private schoolFilter: SchoolFilterService,
  ) {}

  ngOnInit(): void {
    // Read query params first, fall back to defaults
    const params = this.route.snapshot.queryParamMap;
    this.selectedTerm = params.get('term') || this.schoolFilter.term;
    this.selectedYear = params.get('year') || this.schoolFilter.year;

    this.loadPayments();

    this.searchControl.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadPayments();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPayments(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getPayments(
        {
          academicYear: this.selectedYear,
          term: this.selectedTerm,
        },
        this.currentPage,
        this.pageSize,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          // Client-side filter by receipt number / student name if search present
          const q = (this.searchControl.value || '').toLowerCase().trim();
          this.payments = q
            ? data.filter(
                (p) =>
                  p.receipt_number?.toLowerCase().includes(q) ||
                  `${p.student?.first_name} ${p.student?.last_name}`
                    .toLowerCase()
                    .includes(q) ||
                  p.student?.student_number?.toLowerCase().includes(q),
              )
            : data;
          this.totalCount = count;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load receipts';
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.schoolFilter.setBoth(this.selectedTerm, this.selectedYear);
    this.currentPage = 1;
    this.loadPayments();
  }

  viewReceipt(receiptNumber: string): void {
    this.router.navigate(['main/reports/receipts', receiptNumber]);
  }

  viewStudent(studentId: string | undefined): void {
    if (studentId) this.router.navigate(['main/reports/students', studentId]);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPayments();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPayments();
    }
  }

  getStudentName(payment: FeePayment): string {
    const s = payment.student;
    if (!s) return '—';
    return `${s.first_name} ${s.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  back() {
    this.location.back();
  }
}
