// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { AuthService } from './core/services/auth';
import { SupabaseService } from './core/services/supabase';
import { SubscriptionService } from './core/services/subscription.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit {
  title = 'Churchman.';
  showLayout = true;
  authInitialized = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabase: SupabaseService,
    private subscriptionService: SubscriptionService,
  ) {
    // Wire SubscriptionService into AuthService to break the circular dependency
    this.authService.setSubscriptionService(this.subscriptionService);
    this.clearStuckLocks();
  }

  ngOnInit(): void {
    this.supabase.authInitialized$.subscribe((initialized) => {
      this.authInitialized = initialized;
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.showLayout = !event.url.includes('/auth');
      }
    });
  }

  private clearStuckLocks(): void {
    try {
      const hasCleared = sessionStorage.getItem('locks-cleared');
      if (!hasCleared) {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        sessionStorage.setItem('locks-cleared', 'true');
      }
    } catch (error) {
      console.error('Error clearing locks:', error);
    }
  }
}
