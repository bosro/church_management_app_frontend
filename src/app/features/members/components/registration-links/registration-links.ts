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

  // ── Modals ────────────────────────────────────────────────
  showCreateModal = false;
  showEditModal = false;
  showDeleteConfirm = false;
  showQRModal = false;

  // ── QR ────────────────────────────────────────────────────
  selectedLinkForQR: any = null;
  qrCodeValue = '';
  selectedLink: RegistrationLink | null = null;

  // ── Shared form state ─────────────────────────────────────
  editingLink: RegistrationLink | null = null;
  deletingLink: RegistrationLink | null = null;
  deleting = false;
  saving = false;

  hasExpiry = false;
  expiresInHours = 24; // for CREATE (hours from now)
  expiresAtDate: string | null = null; // for EDIT (absolute datetime, local)
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

  // ── CREATE ─────────────────────────────────────────────────

  openCreateModal(): void {
    this.showCreateModal = true;
    this.hasExpiry = false;
    this.expiresInHours = 24;
    this.hasMaxUses = false;
    this.maxUses = null;
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    if (this.saving) return;
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

    this.saving = true;
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
          this.showCreateModal = false;
          this.saving = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create link';
          this.saving = false;
        },
      });
  }

  // ── EDIT ───────────────────────────────────────────────────

  openEditModal(link: RegistrationLink): void {
    this.editingLink = link;
    this.errorMessage = '';

    // Expiry — convert ISO → local datetime-input format
    this.hasExpiry = !!link.expires_at;
    this.expiresAtDate = link.expires_at
      ? this.toLocalDatetimeInput(link.expires_at)
      : null;

    // Max uses
    this.hasMaxUses = link.max_uses !== null;
    this.maxUses = link.max_uses;

    this.showEditModal = true;
  }

  closeEditModal(): void {
    if (this.saving) return;
    this.showEditModal = false;
    this.editingLink = null;
    this.errorMessage = '';
  }

  saveEdit(): void {
    if (!this.editingLink) return;

    if (this.hasExpiry && !this.expiresAtDate) {
      this.errorMessage = 'Please pick an expiration date';
      return;
    }
    if (this.hasMaxUses && (!this.maxUses || this.maxUses < 1)) {
      this.errorMessage = 'Please enter a valid max uses (at least 1)';
      return;
    }

    // Don't let admin set max_uses below current_uses
    if (
      this.hasMaxUses &&
      this.maxUses !== null &&
      this.maxUses < this.editingLink.current_uses
    ) {
      this.errorMessage = `Max uses can't be less than current uses (${this.editingLink.current_uses})`;
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    const expiresAtISO =
      this.hasExpiry && this.expiresAtDate
        ? new Date(this.expiresAtDate).toISOString()
        : null;

    this.linkService
      .updateLink(this.editingLink.id, {
        expires_at: expiresAtISO,
        max_uses: this.hasMaxUses ? this.maxUses : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saving = false;
          this.successMessage = 'Link updated successfully';
          this.showEditModal = false;
          this.editingLink = null;
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.saving = false;
          this.errorMessage = err.message || 'Failed to update link';
        },
      });
  }

  // ── DELETE (permanent) ─────────────────────────────────────

  openDeleteConfirm(link: RegistrationLink): void {
    this.deletingLink = link;
    this.showDeleteConfirm = true;
    this.errorMessage = '';
  }

  closeDeleteConfirm(): void {
    if (this.deleting) return;
    this.showDeleteConfirm = false;
    this.deletingLink = null;
  }

  confirmDelete(): void {
    if (!this.deletingLink) return;
    this.deleting = true;

    this.linkService
      .deleteLink(this.deletingLink.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deleting = false;
          this.showDeleteConfirm = false;
          this.deletingLink = null;
          this.successMessage = 'Link deleted permanently';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.deleting = false;
          this.errorMessage = err.message || 'Failed to delete link';
          this.showDeleteConfirm = false;
        },
      });
  }

  // ── COPY / QR / ACTIVATE ──────────────────────────────────

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
    this.copyToClipboard(this.linkService.getRegistrationUrl(link.link_token));
  }

  deactivateLink(link: RegistrationLink): void {
    this.linkService
      .deactivateLink(link.id)
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

  reactivateLink(link: RegistrationLink): void {
    this.linkService
      .reactivateLink(link.id)
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

  // ── Helpers ────────────────────────────────────────────────

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

  /** ISO → local "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> */
  private toLocalDatetimeInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  goBack(): void {
    this.router.navigate(['main/members']);
  }
}
