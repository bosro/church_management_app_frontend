// src/app/core/guards/auth-guard.ts  — REPLACE the file (adds the 2FA check)
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { SupabaseService } from '../services/supabase';
import { TwoFactorService } from '../services/two-factor-service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router,
    private twoFactor: TwoFactorService,
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.supabase.authInitialized$.pipe(
      filter((initialized) => initialized),
      take(1),
      switchMap(async () => {
        if (!this.authService.isAuthenticated) {
          this.router.navigate(['/auth/signin'], { queryParams: { returnUrl: state.url } });
          return false;
        }
        if (!(await this.twoFactor.isSatisfied())) {
          this.router.navigate(['/two-factor'], { queryParams: { returnUrl: state.url } });
          return false;
        }
        return true;
      }),
    );
  }
}