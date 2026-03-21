// src/app/core/services/pdf-branding.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface PdfBranding {
  /** Church name — falls back to 'Churchman' if not set */
  name: string;
  /** Base64 data URL of the logo, or null if unavailable */
  logoBase64: string | null;
  /** Logo MIME type e.g. 'image/png' */
  logoMimeType: string;
}

@Injectable({ providedIn: 'root' })
export class PdfBrandingService {

  /** In-memory cache so we don't re-fetch on every PDF export */
  private cache: PdfBranding | null = null;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  /**
   * Fetches branding from the church profile.
   * Returns cached result if already loaded.
   * Always resolves — falls back to defaults on any error.
   */
  async getBranding(): Promise<PdfBranding> {
    if (this.cache) return this.cache;

    const fallback: PdfBranding = {
      name: 'Churchman',
      logoBase64: null,
      logoMimeType: 'image/png',
    };

    try {
      const churchId = this.authService.getChurchId();
      if (!churchId) return fallback;

      const { data, error } = await this.supabase.client
        .from('churches')
        .select('name, logo_url')
        .eq('id', churchId)
        .single();

      if (error || !data) return fallback;

      const branding: PdfBranding = {
        name: data.name?.trim() || 'Churchman',
        logoBase64: null,
        logoMimeType: 'image/png',
      };

      // Try to convert logo URL to base64 for jsPDF
      if (data.logo_url) {
        const b64 = await this.urlToBase64(data.logo_url);
        if (b64) {
          branding.logoBase64 = b64.data;
          branding.logoMimeType = b64.mimeType;
        }
      }

      this.cache = branding;
      return branding;

    } catch {
      return fallback;
    }
  }

  /** Clear cached branding — call this after the user updates their church logo/name */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Fetches an image URL and converts it to a base64 data string
   * that jsPDF can use with doc.addImage().
   */
  private async urlToBase64(
    url: string,
  ): Promise<{ data: string; mimeType: string } | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') || 'image/png';
      // Only accept image types
      if (!contentType.startsWith('image/')) return null;

      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // result is "data:image/png;base64,XXXX..."
          // jsPDF addImage needs just the base64 part
          const base64 = result.split(',')[1];
          resolve(base64 ? { data: base64, mimeType: contentType } : null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
}
