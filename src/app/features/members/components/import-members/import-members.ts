// src/app/features/members/components/import-members/import-members.component.ts
import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';
import { AuthService } from '../../../../core/services/auth';

interface ImportResults {
  success: number;
  failed: number;
  errors: string[];
}

@Component({
  selector: 'app-import-members',
  standalone: false,
  templateUrl: './import-members.html',
  styleUrl: './import-members.scss',
})
export class ImportMembers implements OnDestroy {
  private destroy$ = new Subject<void>();

  selectedFile: File | null = null;
  uploading = false;
  uploadProgress = 0;
  errorMessage = '';
  successMessage = '';
  importResults: ImportResults | null = null;

  dragOver = false;

  // Permissions
  canImport = false;

  constructor(
    private memberService: MemberService,
    private authService: AuthService,
    private router: Router
  ) {
    this.checkPermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const importRoles = ['super_admin', 'church_admin'];
    this.canImport = this.authService.hasRole(importRoles);

    if (!this.canImport) {
      this.router.navigate(['/unauthorized']);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFileSelection(input.files[0]);
    }
  }

  private handleFileSelection(file: File): void {
    // Validate file type
    const validExtensions = ['.csv', '.CSV'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(fileExtension)) {
      this.errorMessage = 'Please select a CSV file (.csv)';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = 'File size must be less than 10MB';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    // Validate file is not empty
    if (file.size === 0) {
      this.errorMessage = 'The selected file is empty';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    this.selectedFile = file;
    this.errorMessage = '';
    this.importResults = null;
  }

  removeFile(): void {
    this.selectedFile = null;
    this.importResults = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.uploadProgress = 0;
  }

  uploadFile(): void {
    if (!this.selectedFile) return;

    this.uploading = true;
    this.uploadProgress = 0;
    this.errorMessage = '';
    this.successMessage = '';

    // Simulate progress (since we don't have real-time upload progress)
    const progressInterval = setInterval(() => {
      if (this.uploadProgress < 90) {
        this.uploadProgress += 10;
      }
    }, 200);

    this.memberService.importMembersFromCSV(this.selectedFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          clearInterval(progressInterval);
          this.uploadProgress = 100;
          this.uploading = false;

          this.importResults = {
            success: results.success,
            failed: results.failed,
            errors: results.errors.map(e => `Row ${e.row}: ${e.error}`)
          };

          if (results.success > 0) {
            this.successMessage = `Successfully imported ${results.success} member${results.success > 1 ? 's' : ''}!`;
          }

          if (results.failed > 0) {
            this.errorMessage = `${results.failed} row${results.failed > 1 ? 's' : ''} failed to import. See details below.`;
          }
        },
        error: (error) => {
          clearInterval(progressInterval);
          this.uploading = false;
          this.uploadProgress = 0;
          this.errorMessage = error.message || 'Failed to import members. Please check your file format and try again.';
        }
      });
  }

  downloadTemplate(): void {
    const headers = [
      'First Name*', 'Last Name*', 'Email', 'Phone', 'Gender',
      'Date of Birth (YYYY-MM-DD)', 'Address', 'City', 'Join Date* (YYYY-MM-DD)'
    ];

    const sampleRow = [
      'John', 'Doe', 'john.doe@example.com', '0201234567', 'male',
      '1990-01-15', '123 Main St', 'Accra', '2024-01-01'
    ];

    const instructionRows = [
      '# Instructions:',
      '# 1. Fields marked with * are required',
      '# 2. Date format must be YYYY-MM-DD (e.g., 2024-01-15)',
      '# 3. Phone numbers should be 10 digits (e.g., 0201234567)',
      '# 4. Gender should be: male, female, or other',
      '# 5. Remove these instruction rows before importing',
      '#'
    ];

    const csv = [
      ...instructionRows,
      headers.join(','),
      sampleRow.join(',')
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `member_import_template_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  cancel(): void {
    if (this.uploading) {
      if (confirm('Import is in progress. Are you sure you want to cancel?')) {
        this.router.navigate(['main/members']);
      }
    } else {
      this.router.navigate(['main/members']);
    }
  }

  goToMembers(): void {
    this.router.navigate(['main/members']);
  }
}
