import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Shown when a signed-in session is ended because the church was suspended / deactivated. */
@Component({
  selector: 'app-account-paused',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './account-paused.html',
  styleUrl: './account-paused.scss',
})
export class AccountPaused {
  reason: string | null = null;
  churchName: string | null = null;

  constructor() {
    try {
      const raw = sessionStorage.getItem('churchman_paused');
      if (raw) {
        const info = JSON.parse(raw);
        this.reason = info?.suspended ? info.reason || null : null;
        this.churchName = info?.church_name || null;
        sessionStorage.removeItem('churchman_paused');
      }
    } catch { /* ignore */ }
  }
}
