// src/app/features/members/components/registration-links/registration-links.component.ts
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

  // Modal state
  showCreateModal = false;
  showQRModal = false;
  selectedLinkForQR: any = null;
  qrCodeValue = '';
  selectedLink: RegistrationLink | null = null;

  // Form data
  expiresInHours = 24;
  maxUses: number | null = null;

  // Permissions
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
    this.canManageLinks =
      this.permissionService.isAdmin || this.permissionService.members.import; // import permission covers link creation

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
    this.expiresInHours = 24;
    this.maxUses = null;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
    this.errorMessage = '';
  }

  createLink(): void {
    if (this.expiresInHours < 1) {
      this.errorMessage = 'Expiration must be at least 1 hour';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.linkService
      .createLink({
        expires_in_hours: this.expiresInHours,
        max_uses: this.maxUses || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (link) => {
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

  showQRCode(link: any) {
    const fullUrl = `${window.location.origin}/register/${link.link_token}`;
    this.qrCodeValue = fullUrl; // ← Just set the value
    this.selectedLinkForQR = link;
    this.showQRModal = true;
  }

  closeQRModal() {
    this.showQRModal = false;
    this.selectedLinkForQR = null;
    this.qrCodeValue = '';
  }

  downloadQRCode() {
    const canvas = document.querySelector(
      '.qr-code-image canvas',
    ) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `registration-qr-${this.selectedLinkForQR?.link_token || 'code'}.png`;
      link.click();
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
        'Are you sure you want to deactivate this link? This action cannot be undone.',
      )
    ) {
      return;
    }

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

  getRegistrationUrl(link: RegistrationLink): string {
    return this.linkService.getRegistrationUrl(link.link_token);
  }

  isExpired(link: RegistrationLink): boolean {
    return new Date(link.expires_at) < new Date();
  }

  isMaxedOut(link: RegistrationLink): boolean {
    return link.max_uses !== null && link.current_uses >= link.max_uses;
  }

  getLinkStatus(link: RegistrationLink): string {
    if (!link.is_active) return 'Inactive';
    if (this.isExpired(link)) return 'Expired';
    if (this.isMaxedOut(link)) return 'Max Uses Reached';
    return 'Active';
  }

  getStatusClass(link: RegistrationLink): string {
    const status = this.getLinkStatus(link);
    if (status === 'Active') return 'status-active';
    return 'status-inactive';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  goBack(): void {
    this.router.navigate(['main/members']);
  }
}
