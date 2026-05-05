
// src/app/features/attendance/components/attendance-links-manager/attendance-links-manager.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceLinkService, AttendanceLink } from '../../services/attendance-link.service';
import { PermissionService } from '../../../../core/services/permission.service';

@Component({
  selector: 'app-attendance-links-manager',
  standalone: false,
  templateUrl: './attendance-links-manager.html',
  styleUrl: './attendance-links-manager.scss',
})
export class AttendanceLinksManager implements OnInit, OnDestroy {
  @Input() eventId!: string;
  @Input() eventName: string = '';

  private destroy$ = new Subject<void>();

  links: AttendanceLink[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Create modal
  showCreateModal = false;
  hasExpiry = false;
  expiresInHours = 24;
  hasMaxUses = false;
  maxUses: number | null = null;
  creating = false;

  // QR modal
  showQRModal = false;
  selectedLinkForQR: AttendanceLink | null = null;
  qrCodeValue = '';

  constructor(
    public linkService: AttendanceLinkService,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.loadLinks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLinks(): void {
    this.loading = true;
    this.linkService
      .getLinksForEvent(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (links) => {
          this.links = links;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load links';
          this.loading = false;
        },
      });
  }

  openCreateModal(): void {
    this.hasExpiry = false;
    this.expiresInHours = 24;
    this.hasMaxUses = false;
    this.maxUses = null;
    this.errorMessage = '';
    this.showCreateModal = true;
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

    this.creating = true;
    this.errorMessage = '';

    this.linkService
      .createLink(this.eventId, {
        expires_in_hours: this.hasExpiry ? this.expiresInHours : null,
        max_uses: this.hasMaxUses ? this.maxUses! : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Attendance link created!';
          this.loadLinks();
          this.closeCreateModal();
          this.creating = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to create link';
          this.creating = false;
        },
      });
  }

  toggleActive(link: AttendanceLink): void {
    const newState = !link.is_active;
    this.linkService
      .setActive(link.id, newState)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = newState ? 'Link activated.' : 'Link deactivated.';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to update link';
        },
      });
  }

  deleteLink(linkId: string): void {
    if (!confirm('Delete this attendance link? This cannot be undone.')) return;

    this.linkService
      .deleteLink(linkId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Link deleted.';
          this.loadLinks();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete link';
        },
      });
  }

  copyLink(link: AttendanceLink): void {
    const url = this.linkService.getLinkUrl(link.link_token);
    navigator.clipboard.writeText(url).then(() => {
      this.successMessage = 'Link copied to clipboard!';
      setTimeout(() => (this.successMessage = ''), 3000);
    });
  }

  openQRModal(link: AttendanceLink): void {
    this.selectedLinkForQR = link;
    this.qrCodeValue = this.linkService.getLinkUrl(link.link_token);
    this.showQRModal = true;
  }

  closeQRModal(): void {
    this.showQRModal = false;
    this.selectedLinkForQR = null;
    this.qrCodeValue = '';
  }

  downloadQRCode(): void {
    const canvas = document.querySelector('.al-qr-wrapper canvas') as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-link-${this.selectedLinkForQR?.link_token?.substring(0, 8) || 'qr'}.png`;
      a.click();
    }
  }

  copyQRLink(): void {
    navigator.clipboard.writeText(this.qrCodeValue).then(() => {
      this.successMessage = 'Link copied!';
      setTimeout(() => (this.successMessage = ''), 2000);
    });
  }
}


