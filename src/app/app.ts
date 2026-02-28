// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { AuthService } from './core/services/auth';
import { SupabaseService } from './core/services/supabase';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  title = 'Churchman.';
  showLayout = true;

  // ✅ NEW: Track auth initialization
  authInitialized = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabase: SupabaseService // ✅ Add SupabaseService
  ) {
    // Clear stuck locks on first load ONLY
    this.clearStuckLocks();
  }

  ngOnInit(): void {
    // ✅ NEW: Wait for auth to initialize
    this.supabase.authInitialized$.subscribe(initialized => {
      this.authInitialized = initialized;
      console.log('Auth initialized:', initialized);
    });

    // Debug routing
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        console.log('NavigationStart:', event.url);
      }
      if (event instanceof NavigationEnd) {
        console.log('NavigationEnd:', event.url);
        this.showLayout = !event.url.includes('/auth');
      }
    });
  }

  private clearStuckLocks(): void {
    try {
      const hasCleared = sessionStorage.getItem('locks-cleared');

      if (!hasCleared) {
        console.log('🔧 Clearing stuck Supabase locks...');

        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });

        sessionStorage.setItem('locks-cleared', 'true');
        console.log('✅ Locks cleared successfully');
      }
    } catch (error) {
      console.error('Error clearing locks:', error);
    }
  }
}
