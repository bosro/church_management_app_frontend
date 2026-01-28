
// src/app/features/members/components/import-members/import-members.component.ts
import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from '../../services/member.service';

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
  importResults: { success: number; errors: string[] } | null = null;

  dragOver = false;

  constructor(
    private memberService: MemberService,
    private router: Router
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    if (!file.name.endsWith('.csv')) {
      this.errorMessage = 'Please select a CSV file';
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = 'File size must be less than 10MB';
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
  }

  uploadFile(): void {
    if (!this.selectedFile) return;

    this.uploading = true;
    this.uploadProgress = 0;
    this.errorMessage = '';
    this.successMessage = '';

    // Simulate progress
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
          this.importResults = results;

          if (results.success > 0) {
            this.successMessage = `Successfully imported ${results.success} member${results.success > 1 ? 's' : ''}`;
          }

          if (results.errors.length > 0) {
            this.errorMessage = `${results.errors.length} error${results.errors.length > 1 ? 's' : ''} occurred during import`;
          }
        },
        error: (error) => {
          clearInterval(progressInterval);
          this.uploading = false;
          this.errorMessage = error.message || 'Failed to import members. Please try again.';
        }
      });
  }

  downloadTemplate(): void {
    const headers = [
      'First Name', 'Last Name', 'Email', 'Phone', 'Gender',
      'Date of Birth (YYYY-MM-DD)', 'Address', 'Join Date (YYYY-MM-DD)'
    ];
    const sampleRow = [
      'John', 'Doe', 'john.doe@example.com', '0201234567', 'male',
      '1990-01-15', '123 Main St, Accra', '2024-01-01'
    ];

    const csv = [
      headers.join(','),
      sampleRow.join(',')
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'member_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  cancel(): void {
    this.router.navigate(['/members']);
  }

  goToMembers(): void {
    this.router.navigate(['/members']);
  }
}
