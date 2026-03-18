
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  FeeStructure, SchoolClass, TERMS
} from '../../../../../models/school.model';
import { Router } from '@angular/router';

@Component({
 selector: 'app-fee-structures',
  standalone: false,
  templateUrl: './fee-structures.html',
  styleUrl: './fee-structures.scss',
})
export class FeeStructures implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  feeStructures: FeeStructure[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Filters
  selectedClassId = '';
  selectedTerm = TERMS[0];
  selectedYear = '';
  terms = TERMS;
  academicYears: string[] = [];

  // Modal
  showModal = false;
  editingFee: FeeStructure | null = null;
  processing = false;

  feeForm = {
    class_id: '',
    fee_name: '',
    amount: 0,
    is_mandatory: true,
    academic_year: '',
    term: TERMS[0],
  };

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    const year = new Date().getFullYear();
    this.selectedYear = `${year}/${year + 1}`;
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
    ];
    this.loadClasses();
    this.loadFeeStructures();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadFeeStructures(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getAllFeeStructures(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.feeStructures = this.selectedClassId
            ? fees.filter((f) => f.class_id === this.selectedClassId)
            : fees;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load fee structures';
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.loadFeeStructures();
  }

  // Group fees by class
  get groupedFees(): { class: SchoolClass; fees: FeeStructure[] }[] {
    const groups: { [key: string]: FeeStructure[] } = {};
    this.feeStructures.forEach((f) => {
      if (!groups[f.class_id]) groups[f.class_id] = [];
      groups[f.class_id].push(f);
    });

    return Object.keys(groups).map((classId) => ({
      class: groups[classId][0].class || ({ name: 'Unknown' } as SchoolClass),
      fees: groups[classId],
    }));
  }

  getClassTotal(fees: FeeStructure[]): number {
    return fees.reduce((s, f) => s + Number(f.amount), 0);
  }

  openCreateModal(): void {
    this.editingFee = null;
    this.feeForm = {
      class_id: this.selectedClassId || '',
      fee_name: '',
      amount: 0,
      is_mandatory: true,
      academic_year: this.selectedYear,
      term: this.selectedTerm,
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  openEditModal(fee: FeeStructure): void {
    this.editingFee = fee;
    this.feeForm = {
      class_id: fee.class_id,
      fee_name: fee.fee_name,
      amount: fee.amount,
      is_mandatory: fee.is_mandatory,
      academic_year: fee.academic_year,
      term: fee.term,
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  closeModal(): void {
    this.showModal = false;
    this.editingFee = null;
  }

  saveFee(): void {
    if (!this.feeForm.class_id || !this.feeForm.fee_name || !this.feeForm.amount) {
      this.errorMessage = 'Class, fee name and amount are required';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    const obs = this.editingFee
      ? this.schoolService.updateFeeStructure(this.editingFee.id, this.feeForm)
      : this.schoolService.createFeeStructure(this.feeForm);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = this.editingFee
          ? 'Fee updated successfully!'
          : 'Fee created successfully!';
        this.processing = false;
        this.closeModal();
        this.loadFeeStructures();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to save fee';
        this.processing = false;
      },
    });
  }

  deleteFee(fee: FeeStructure): void {
    if (!confirm(`Delete "${fee.fee_name}" fee?`)) return;

    this.schoolService
      .deleteFeeStructure(fee.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Fee deleted successfully!';
          this.loadFeeStructures();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete fee';
        },
      });
  }

  assignFeesToClass(classId: string): void {
    if (!confirm('This will assign these fees to all active students in this class. Continue?'))
      return;

    this.schoolService
      .assignFeesToClass(classId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Fees assigned to all students in class!';
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to assign fees';
        },
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }
}
