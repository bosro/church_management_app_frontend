
// src/app/features/reports/components/school/students/student-registration-links/student-registration-links.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StudentRegistrationLink, StudentRegistrationLinkService } from '../../../services/student-registration-link.service';
import { SchoolClass } from '../../../../../models/school.model';
import { AuthService } from '../../../../../core/services/auth';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolService } from '../../../services/school.service';


@Component({
  selector: 'app-student-registration-links',
  standalone: false,
  templateUrl: './student-registration-links.html',
  styleUrl: './student-registration-links.scss',
})
export class StudentRegistrationLinks implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  links: StudentRegistrationLink[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  showCreateModal = false;
  showQRModal = false;
  selectedLinkForQR: any = null;
  qrCodeValue = '';

  // Form state
  hasExpiry = false;
  expiresInHours = 24;
  hasMaxUses = false;
  maxUses: number | null = null;
  restrictToClass = false;
  selectedClassId = '';

  canManageLinks = false;

  constructor(
    private linkService: StudentRegistrationLinkService,
    private schoolService: SchoolService,
    private authService: AuthService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadLinks();
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageLinks =
      this.permissionService.isAdmin ||
      this.permissionService.school?.manage;

    if (!this.canManageLinks) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => (this.classes = c),
      });
  }

  loadLinks(): void {
    this.loading = true;
    this.errorMessage = '';

    this.linkService
      .getLinks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (links) => {
          this.links = links;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load links';
          this.loading = false;
        },
      });
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.hasExpiry = false;
    this.expiresInHours = 24;
    this.hasMaxUses = false;
    this.maxUses = null;
    this.restrictToClass = false;
    this.selectedClassId = '';
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
    this.errorMessage = '';
  }

  createLink(): void {
    if (this.hasExpiry && (!this.expiresInHours || this.expiresInHours < 1)) {
      this.errorMessage = 'Please enter a valid expiration (at least 1 hour)';
      return;
    }
    if (this.hasMaxUses && (!this.maxUses || this.maxUses < 1)) {
      this.errorMessage = 'Please enter a valid max uses (at least 1)';
      return;
    }
    if (this.restrictToClass && !this.selectedClassId) {
      this.errorMessage = 'Please select a class';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.linkService
      .createLink({
        expires_in_hours: this.hasExpiry ? this.expiresInHours : null,
        max_uses: this.hasMaxUses ? this.maxUses! : null,
        class_id: this.restrictToClass ? this.selectedClassId : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration link created!';
          this.loadLinks();
          this.closeCreateModal();
          this.loading = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create link';
          this.loading = false;
        },
      });
  }

  copyToClipboard(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.successMessage = 'Link copied to clipboard!';
        setTimeout(() => (this.successMessage = ''), 3000);
      })
      .catch(() => {
        this.errorMessage = 'Failed to copy link';
        setTimeout(() => (this.errorMessage = ''), 3000);
      });
  }

  showQRCode(link: StudentRegistrationLink): void {
    this.qrCodeValue = this.linkService.getRegistrationUrl(link.link_token);
    this.selectedLinkForQR = link;
    this.showQRModal = true;
  }

  closeQRModal(): void {
    this.showQRModal = false;
    this.selectedLinkForQR = null;
    this.qrCodeValue = '';
  }

  downloadQRCode(): void {
    const canvas = document.querySelector('.qr-code-image canvas') as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-registration-qr-${this.selectedLinkForQR?.link_token || 'code'}.png`;
      a.click();
    }
  }

  copyLink(link: StudentRegistrationLink): void {
    const url = this.linkService.getRegistrationUrl(link.link_token);
    this.copyToClipboard(url);
  }

  deactivateLink(linkId: string): void {
    if (!confirm('Deactivate this link? You can reactivate it later.')) return;
    this.linkService
      .deactivateLink(linkId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Link deactivated';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => (this.errorMessage = err.message || 'Failed'),
      });
  }

  reactivateLink(linkId: string): void {
    this.linkService
      .reactivateLink(linkId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Link reactivated';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => (this.errorMessage = err.message || 'Failed'),
      });
  }

  getRegistrationUrl(link: StudentRegistrationLink): string {
    return this.linkService.getRegistrationUrl(link.link_token);
  }

  isExpired(link: StudentRegistrationLink): boolean {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  }

  isMaxedOut(link: StudentRegistrationLink): boolean {
    return link.max_uses !== null && link.current_uses >= link.max_uses;
  }

  getLinkStatus(link: StudentRegistrationLink): string {
    if (this.isExpired(link)) return 'Expired';
    if (this.isMaxedOut(link)) return 'Max Uses Reached';
    if (!link.is_active) return 'Deactivated';
    return 'Active';
  }

  getStatusClass(link: StudentRegistrationLink): string {
    if (this.isExpired(link)) return 'status-expired';
    if (this.isMaxedOut(link)) return 'status-maxed';
    if (!link.is_active) return 'status-inactive';
    return 'status-active';
  }

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  }

  formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return 'Never';
    return new Date(expiresAt).toLocaleString();
  }

  goBack(): void {
    this.router.navigate(['main/reports/students']);
  }
}
