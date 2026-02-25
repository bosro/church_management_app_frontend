// src/app/core/guards/auth.guard.ts
import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { Observable } from 'rxjs';
import { map, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { SupabaseService } from '../services/supabase';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    // ✅ Wait for auth to initialize before checking
    return this.supabase.authInitialized$.pipe(
      filter(initialized => initialized), // Wait until initialized
      take(1), // Only take the first emission
      map(() => {
        if (this.authService.isAuthenticated) {
          return true;
        }

        // Redirect to sign in page with return url
        this.router.navigate(['/auth/signin'], {
          queryParams: { returnUrl: state.url }
        });
        return false;
      })
    );
  }
}
