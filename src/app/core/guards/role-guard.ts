// src/app/core/guards/role.guard.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanMatch,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree
} from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate, CanMatch {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    const requiredRoles = route.data['roles'] as Array<string>;

    return this.authService.authReady$.pipe(
      filter(ready => ready === true),  // ✅ wait for profile to be loaded
      take(1),
      map(() => {
        if (!requiredRoles || requiredRoles.length === 0) {
          return true;
        }

        if (this.authService.hasRole(requiredRoles)) {
          return true;
        }

        return this.router.createUrlTree(['/unauthorized']);
      })
    );
  }

  canMatch(
    route: Route,
    segments: UrlSegment[]
  ): Observable<boolean | UrlTree> {
    const requiredRoles = route.data?.['roles'] as Array<string>;

    return this.authService.authReady$.pipe(
      filter(ready => ready === true),  // ✅ wait for profile to be loaded
      take(1),
      map(() => {
        if (!requiredRoles || requiredRoles.length === 0) {
          return true;
        }

        if (this.authService.hasRole(requiredRoles)) {
          return true;
        }

        return this.router.createUrlTree(['/unauthorized']);
      })
    );
  }
}
