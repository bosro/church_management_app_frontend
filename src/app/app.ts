// src/app/app.component.ts
// FIXED VERSION V2 - No conflicting redirects

import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  title = 'Churchman';
  showLayout = true;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    // Clear stuck locks on first load ONLY
    this.clearStuckLocks();
  }

  ngOnInit(): void {
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

    // REMOVED: Manual auth redirect
    // Let the routing configuration and AuthGuard handle redirects
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
