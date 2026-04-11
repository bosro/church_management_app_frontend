// src/app/core/guards/permission.guard.ts
import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanMatch,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
} from '@angular/router';
import { Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { UserRolesService } from '../../features/user-roles/services/user-roles';

@Injectable({
  providedIn: 'root',
})
export class PermissionGuard implements CanActivate, CanMatch {
  constructor(
    private authService: AuthService,
    private userRolesService: UserRolesService,
    private router: Router,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Observable<boolean | UrlTree> {
    return this.check(
      route.data['permission'],
      route.data['roles'],
      route.data['requiresFeature'],
    );
  }

  canMatch(
    route: Route,
    segments: UrlSegment[],
  ): Observable<boolean | UrlTree> {
    return this.check(
      route.data?.['permission'],
      route.data?.['roles'],
      route.data?.['requiresFeature'],
    );
  }

  private check(
    requiredPermission?: string,
    requiredRoles?: string[],
    requiredFeature?: string,
  ): Observable<boolean | UrlTree> {
    return this.authService.authReady$.pipe(
      filter((ready) => ready === true),
      take(1),
      map(() => {
        const userRole = this.authService.getCurrentUserRole();

        // ① Super admin bypasses EVERYTHING including feature flags
        if (userRole === 'super_admin') {
          return true;
        }

        // ② Check feature flag — church must have this feature enabled
        if (
          requiredFeature &&
          !this.authService.hasChurchFeature(requiredFeature)
        ) {
          return this.router.createUrlTree(['/unauthorized']);
        }

        // ③ church_admin always passes role/permission checks
        if (userRole === 'church_admin') {
          return true;
        }

        // ④ Check role
        if (requiredRoles && requiredRoles.length > 0) {
          if (this.authService.hasRole(requiredRoles)) {
            return true;
          }
        }

        // ⑤ Check permission
        if (requiredPermission) {
          if (this.userRolesService.hasPermission(requiredPermission)) {
            return true;
          }
        }

        return this.router.createUrlTree(['/unauthorized']);
      }),
    );
  }
}
