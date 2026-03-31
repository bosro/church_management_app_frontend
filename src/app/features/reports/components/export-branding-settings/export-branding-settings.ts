
import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { PdfBrandingService } from '../../../../core/services/pdf-branding.service';

@Component({
  selector: 'app-export-branding',
  standalone: false,
  template: `
    <div class="branding-modal" (click)="$event.stopPropagation()">
      <div class="branding-header">
        <div class="branding-header-left">
          <i class="ri-palette-line"></i>
          <div>
            <h3>Export Branding</h3>
            <p>Customise how your exports look. Leave blank to use defaults.</p>
          </div>
        </div>
        <button class="close-btn" (click)="close.emit()">
          <i class="ri-close-line"></i>
        </button>
      </div>

      <div class="branding-body">
        <!-- Logo -->
        <div class="branding-section">
          <label class="branding-label">Organisation Logo</label>
          <div class="logo-upload-area" (click)="logoInput.click()"
               [class.has-logo]="previewUrl">
            <img *ngIf="previewUrl" [src]="previewUrl" class="logo-preview" />
            <div *ngIf="!previewUrl" class="logo-placeholder">
              <i class="ri-image-add-line"></i>
              <span>Click to upload logo</span>
              <small>PNG, JPG up to 2MB</small>
            </div>
            <button *ngIf="previewUrl" class="logo-remove"
                    (click)="removeLogo($event)">
              <i class="ri-close-circle-fill"></i>
            </button>
          </div>
          <input #logoInput type="file" accept="image/*"
                 style="display:none" (change)="onLogoSelected($event)" />
        </div>

        <!-- Name -->
        <div class="branding-field">
          <label>Organisation Name</label>
          <input type="text" [(ngModel)]="form.name"
                 placeholder="e.g. Grace Community School" />
        </div>

        <!-- Tagline -->
        <div class="branding-field">
          <label>Tagline <span class="optional">optional</span></label>
          <input type="text" [(ngModel)]="form.tagline"
                 placeholder="e.g. Nurturing Excellence" />
        </div>

        <!-- Address -->
        <div class="branding-field">
          <label>Address <span class="optional">optional</span></label>
          <input type="text" [(ngModel)]="form.address"
                 placeholder="e.g. 12 School Road, Accra" />
        </div>

        <!-- Phone -->
        <div class="branding-field">
          <label>Phone <span class="optional">optional</span></label>
          <input type="text" [(ngModel)]="form.phone"
                 placeholder="e.g. +233 24 000 0000" />
        </div>

        <div class="branding-note" *ngIf="isUsingDefaults">
          <i class="ri-information-line"></i>
          Currently using your church's default branding.
          Fill in fields above to override for exports.
        </div>
      </div>

      <div class="branding-footer">
        <button class="btn-reset" (click)="resetToDefaults()"
                *ngIf="!isUsingDefaults">
          <i class="ri-refresh-line"></i> Reset to Defaults
        </button>
        <div class="footer-right">
          <button class="btn-cancel" (click)="close.emit()">Cancel</button>
          <button class="btn-save" (click)="save()">
            <i class="ri-save-line"></i> Save Branding
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './export-branding-settings.scss',
})
export class ExportBrandingSettings implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  form = {
    name: '',
    tagline: '',
    address: '',
    phone: '',
  };

  previewUrl: string | null = null;
  private logoBase64 = '';
  private logoMimeType = 'image/png';

  constructor(private brandingService: PdfBrandingService) {}

  ngOnInit(): void {
    const stored = this.brandingService.getStoredBranding();
    if (stored) {
      this.form.name = stored.name || '';
      this.form.tagline = stored.tagline || '';
      this.form.address = stored.address || '';
      this.form.phone = stored.phone || '';
      if (stored.logoBase64) {
        this.logoBase64 = stored.logoBase64;
        this.logoMimeType = stored.logoMimeType || 'image/png';
        this.previewUrl = `data:${this.logoMimeType};base64,${this.logoBase64}`;
      }
    }
  }

  get isUsingDefaults(): boolean {
    const s = this.brandingService.getStoredBranding();
    return !s || Object.keys(s).length === 0;
  }

  async onLogoSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2MB');
      return;
    }
    this.logoMimeType = file.type;
    this.logoBase64 = await this.brandingService.fileToBase64(file);
    this.previewUrl = `data:${file.type};base64,${this.logoBase64}`;
  }

  removeLogo(event: Event): void {
    event.stopPropagation();
    this.logoBase64 = '';
    this.logoMimeType = 'image/png';
    this.previewUrl = null;
  }

  save(): void {
    this.brandingService.saveCustomBranding({
      name: this.form.name || undefined,
      tagline: this.form.tagline || undefined,
      address: this.form.address || undefined,
      phone: this.form.phone || undefined,
      logoBase64: this.logoBase64 || undefined,
      logoMimeType: this.logoMimeType || undefined,
    });
    this.saved.emit();
    this.close.emit();
  }

  resetToDefaults(): void {
    this.brandingService.clearCustomBranding();
    this.form = { name: '', tagline: '', address: '', phone: '' };
    this.logoBase64 = '';
    this.previewUrl = null;
    this.saved.emit();
    this.close.emit();
  }
}
