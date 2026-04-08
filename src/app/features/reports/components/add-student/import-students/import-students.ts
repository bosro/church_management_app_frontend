import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass } from '../../../../../models/school.model';

interface ImportError {
  message: string;
  type: 'class_not_found' | 'missing_name' | 'other';
}

interface ImportResults {
  success: number;
  failed: number;
  errors: ImportError[];
}

@Component({
  selector: 'app-import-students',
  standalone: false,
  templateUrl: './import-students.html',
  styleUrl: './import-students.scss',
})
export class ImportStudents implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  selectedFile: File | null = null;
  uploading = false;
  uploadProgress = 0;
  errorMessage = '';
  successMessage = '';
  importResults: ImportResults | null = null;
  dragOver = false;

  // Default class for formats that have no class column (e.g. JMS Admission Form)
  classes: SchoolClass[] = [];
  defaultClassId = '';
  detectedFormat: 'jms_admission' | 'standard' | null = null;

  constructor(
    private schoolService: SchoolService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.school.manage) {
      this.router.navigate(['/unauthorized']);
    }
    this.loadClasses();
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

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;
    const files = e.dataTransfer?.files;
    if (files?.length) this.handleFileSelection(files[0]);
  }

  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.handleFileSelection(input.files[0]);
  }

  private handleFileSelection(file: File): void {
    const ext = file.name.substring(file.name.lastIndexOf('.'));
    if (!['.csv', '.CSV', '.xlsx', '.XLSX', '.xls', '.XLS'].includes(ext)) {
      this.errorMessage = 'Please select a CSV or Excel file';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = 'File size must be less than 10MB';
      return;
    }
    if (file.size === 0) {
      this.errorMessage = 'The selected file is empty';
      return;
    }
    this.selectedFile = file;
    this.errorMessage = '';
    this.importResults = null;
    this.defaultClassId = '';
    this.sniffFileFormat(file);
  }

  // Peek at the file headers to show the class picker when needed
  private sniffFileFormat(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      // For CSV just check header row
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        const firstLine = text.split('\n')[0] || '';
        const upper = firstLine.toUpperCase();
        this.detectedFormat =
          upper.includes('STUDENT NAME') || upper.includes("FATHER'S NAME")
            ? 'jms_admission'
            : 'standard';
      };
      reader.readAsText(file.slice(0, 1024)); // Only read first 1KB
    } else {
      // For XLSX do a lightweight header peek using FileReader + basic check
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          // We can't easily parse XLSX without the full library here,
          // so detect by filename pattern or fall back to showing the picker always
          // The service will auto-detect the real format during upload anyway
          const nameLower = file.name.toLowerCase();
          this.detectedFormat =
            nameLower.includes('admission') || nameLower.includes('jms')
              ? 'jms_admission'
              : null; // null = unknown, show picker as optional
        } catch {
          this.detectedFormat = null;
        }
      };
      reader.readAsArrayBuffer(file.slice(0, 512));
    }
  }

  get showClassPicker(): boolean {
    // Show the class picker when format is JMS admission OR format is unknown (xlsx without clear signals)
    // It's always optional — if the file has a Class column, that takes priority anyway
    return this.selectedFile !== null && !this.importResults;
  }

  removeFile(): void {
    this.selectedFile = null;
    this.importResults = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.uploadProgress = 0;
    this.defaultClassId = '';
    this.detectedFormat = null;
  }

  uploadFile(): void {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.uploadProgress = 0;
    this.errorMessage = '';
    this.successMessage = '';

    const interval = setInterval(() => {
      if (this.uploadProgress < 90) this.uploadProgress += 10;
    }, 200);

    this.schoolService
      .importStudentsFromFile(
        this.selectedFile,
        this.defaultClassId || undefined,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          clearInterval(interval);
          this.uploadProgress = 100;
          this.uploading = false;
          this.importResults = {
            success: results.success,
            failed: results.failed,
            errors: results.errors.map((e) => {
              const msg = `Row ${e.row}: ${e.error}`;
              let type: ImportError['type'] = 'other';
              if (e.error.includes('not found')) type = 'class_not_found';
              else if (
                e.error.includes('First name') ||
                e.error.includes('Last name') ||
                e.error.includes('STUDENT NAME')
              )
                type = 'missing_name';
              return { message: msg, type };
            }),
          };
          if (results.success > 0)
            this.successMessage = `Successfully imported ${results.success} student${results.success > 1 ? 's' : ''}!`;
          if (results.failed > 0)
            this.errorMessage = `${results.failed} row${results.failed > 1 ? 's' : ''} failed. See details below.`;
        },
        error: (err) => {
          clearInterval(interval);
          this.uploading = false;
          this.uploadProgress = 0;
          this.errorMessage =
            err.message || 'Import failed. Check your file and try again.';
        },
      });
  }

  downloadTemplate(): void {
    const instructions = [
      '# Student Import Template',
      '# Required fields: First Name, Last Name, Class',
      '# Class must exactly match a class name in your system (e.g. Primary 1, JHS 2)',
      '# Date format: YYYY-MM-DD',
      '# Remove these instruction lines before importing',
      '#',
    ];
    const headers = [
      'First Name*',
      'Middle Name',
      'Last Name*',
      'Date of Birth (YYYY-MM-DD)',
      'Gender',
      'Class*',
      'Parent Name',
      'Parent Phone',
      'Parent Email',
      'Address',
    ];
    const sample = [
      'Kwame',
      'Asante',
      'Mensah',
      '2015-04-10',
      'male',
      'Primary 3',
      'Kofi Mensah',
      '0201234567',
      'kofi@example.com',
      '12 Ring Road, Accra',
    ];
    const csv = [...instructions, headers.join(','), sample.join(',')].join(
      '\n',
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  cancel(): void {
    this.router.navigate(['main/reports/students']);
  }

  goToStudents(): void {
    this.router.navigate(['main/reports/students']);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}
