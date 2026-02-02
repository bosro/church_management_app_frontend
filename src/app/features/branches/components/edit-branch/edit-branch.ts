
// src/app/features/branches/components/edit-branch/edit-branch.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Branch } from '../../../../models/branch.model';
import { BranchesService } from '../../services/branches';

@Component({
  selector: 'app-edit-branch',
  standalone: false,
  templateUrl: './edit-branch.html',
  styleUrl: './edit-branch.scss'
})
export class EditBranch implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branchId: string = '';
  branch: Branch | null = null;
  branchForm!: FormGroup;
  loading = false;
  loadingBranch = true;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private branchesService: BranchesService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.branchId) {
      this.loadBranch();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.branchForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      pastor_name: [''],
      address: [''],
      city: [''],
      state: [''],
      country: [''],
      phone: [''],
      email: ['', [Validators.email]],
      established_date: ['']
    });
  }

  private loadBranch(): void {
    this.loadingBranch = true;

    this.branchesService.getBranchById(this.branchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (branch) => {
          this.branch = branch;
          this.populateForm(branch);
          this.loadingBranch = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load branch';
          this.loadingBranch = false;
        }
      });
  }

  private populateForm(branch: Branch): void {
    this.branchForm.patchValue({
      name: branch.name,
      pastor_name: branch.pastor_name,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      phone: branch.phone,
      email: branch.email,
      established_date: branch.established_date
    });
  }

  onSubmit(): void {
    if (this.branchForm.invalid) {
      this.markFormGroupTouched(this.branchForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.branchesService.updateBranch(this.branchId, this.branchForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Branch updated successfully!';
          setTimeout(() => {
            this.router.navigate(['/branches']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update branch. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/branches']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.branchForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
