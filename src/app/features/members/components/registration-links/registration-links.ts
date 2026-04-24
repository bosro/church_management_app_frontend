// src/app/features/members/components/registration-links/registration-links.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback.
// AuthService was already injected — no import change needed.
// All other logic is unchanged from your original.
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  RegistrationLinkService,
  RegistrationLink,
} from '../../services/registration-link.service';
import { AuthService } from '../../../../core/services/auth';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-registration-links',
  standalone: false,
  templateUrl: './registration-links.html',
  styleUrl: './registration-links.scss',
})
export class RegistrationLinks implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  links: RegistrationLink[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  showCreateModal = false;
  showQRModal = false;
  selectedLinkForQR: any = null;
  qrCodeValue = '';
  selectedLink: RegistrationLink | null = null;

  hasExpiry = false;
  expiresInHours = 24;
  hasMaxUses = false;
  maxUses: number | null = null;

  canManageLinks = false;

  constructor(
    private linkService: RegistrationLinkService,
    private authService: AuthService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadLinks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    // Registration links are an admin/pastor-level feature — not for cell leaders
    const manageRoles = ['pastor', 'senior_pastor', 'associate_pastor'];

    this.canManageLinks =
      this.permissionService.isAdmin ||
      this.permissionService.members.import ||
      manageRoles.includes(role);

    if (!this.canManageLinks) {
      this.router.navigate(['/unauthorized']);
    }
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
          this.errorMessage =
            error.message || 'Failed to load registration links';
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
      this.errorMessage = 'Please enter a valid maximum uses (at least 1)';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.linkService
      .createLink({
        expires_in_hours: this.hasExpiry ? this.expiresInHours : null,
        max_uses: this.hasMaxUses ? this.maxUses! : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration link created successfully!';
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

  showQRCode(link: any): void {
    const fullUrl = `${window.location.origin}/public/register/${link.link_token}`;
    this.qrCodeValue = fullUrl;
    this.selectedLinkForQR = link;
    this.showQRModal = true;
  }

  closeQRModal(): void {
    this.showQRModal = false;
    this.selectedLinkForQR = null;
    this.qrCodeValue = '';
  }

  downloadQRCode(): void {
    const canvas = document.querySelector(
      '.qr-code-image canvas',
    ) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `registration-qr-${this.selectedLinkForQR?.link_token || 'code'}.png`;
      a.click();
    }
  }

  copyLink(link: RegistrationLink): void {
    const url = this.linkService.getRegistrationUrl(link.link_token);
    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.successMessage = 'Link copied to clipboard!';
        setTimeout(() => (this.successMessage = ''), 3000);
      })
      .catch(() => {
        this.errorMessage = 'Failed to copy link';
        setTimeout(() => (this.errorMessage = ''), 3000);
      });
  }

  deactivateLink(linkId: string): void {
    if (
      !confirm(
        'Are you sure you want to deactivate this link? You can reactivate it later.',
      )
    )
      return;
    this.linkService
      .deactivateLink(linkId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Link deactivated successfully';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to deactivate link';
        },
      });
  }

  reactivateLink(linkId: string): void {
    this.linkService
      .reactivateLink(linkId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Link reactivated successfully';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to reactivate link';
        },
      });
  }

  getRegistrationUrl(link: RegistrationLink): string {
    return this.linkService.getRegistrationUrl(link.link_token);
  }

  isExpired(link: RegistrationLink): boolean {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  }

  isMaxedOut(link: RegistrationLink): boolean {
    return link.max_uses !== null && link.current_uses >= link.max_uses;
  }

  getLinkStatus(link: RegistrationLink): string {
    if (this.isExpired(link)) return 'Expired';
    if (this.isMaxedOut(link)) return 'Max Uses Reached';
    if (!link.is_active) return 'Deactivated';
    return 'Active';
  }

  getStatusClass(link: RegistrationLink): string {
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
    this.router.navigate(['main/members']);
  }
}


