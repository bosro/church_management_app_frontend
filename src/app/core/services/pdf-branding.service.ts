import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface PdfBranding {
  name: string;
  logoBase64: string | null;
  logoMimeType: string;
  address?: string;
  phone?: string;
  tagline?: string;
}

const STORAGE_KEY = 'churchman_export_branding';

@Injectable({ providedIn: 'root' })
export class PdfBrandingService {

  private cache: PdfBranding | null = null;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ── Custom branding (localStorage) ───────────────────────

  saveCustomBranding(branding: Partial<PdfBranding>): void {
    const existing = this.getStoredBranding() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...branding }));
    this.cache = null; // clear cache so next getBranding() picks up changes
  }

  clearCustomBranding(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.cache = null;
  }

  getStoredBranding(): Partial<PdfBranding> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ── Main method — custom overrides church defaults ────────

  async getBranding(): Promise<PdfBranding> {
    if (this.cache) return this.cache;

    const church = await this.fetchChurchBranding();
    const custom = this.getStoredBranding();

    const merged: PdfBranding = {
      name: custom?.name?.trim() || church.name,
      logoBase64: custom?.logoBase64 ?? church.logoBase64,
      logoMimeType: custom?.logoMimeType || church.logoMimeType,
      address: custom?.address?.trim() || church.address || '',
      phone: custom?.phone?.trim() || church.phone || '',
      tagline: custom?.tagline?.trim() || '',
    };

    this.cache = merged;
    return merged;
  }

  /** Clear cached branding — call after user updates church logo/name */
  clearCache(): void {
    this.cache = null;
  }

  // ── Fetch church branding from Supabase ───────────────────

  private async fetchChurchBranding(): Promise<PdfBranding> {
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
        .select('name, logo_url, address, phone, city')
        .eq('id', churchId)
        .single();

      if (error || !data) return fallback;

      const address = [data.address, data.city].filter(Boolean).join(', ');

      const branding: PdfBranding = {
        name: data.name?.trim() || 'Churchman',
        logoBase64: null,
        logoMimeType: 'image/png',
        address,
        phone: data.phone || '',
        tagline: '',
      };

      if (data.logo_url) {
        const b64 = await this.urlToBase64(data.logo_url);
        if (b64) {
          branding.logoBase64 = b64.data;
          branding.logoMimeType = b64.mimeType;
        }
      }

      return branding;

    } catch {
      return fallback;
    }
  }

  // ── Convert uploaded file to base64 ──────────────────────

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Convert URL to base64 ─────────────────────────────────

  private async urlToBase64(
    url: string,
  ): Promise<{ data: string; mimeType: string } | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) return null;

      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
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
