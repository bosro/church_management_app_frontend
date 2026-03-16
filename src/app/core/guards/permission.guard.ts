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

        // Check feature flag first — if feature not enabled for this church,
        // block access regardless of role or permission
        if (requiredFeature && !this.authService.hasChurchFeature(requiredFeature)) {
          return this.router.createUrlTree(['/unauthorized']);
        }

        // super_admin and church_admin always pass
        if (userRole === 'super_admin' || userRole === 'church_admin') {
          return true;
        }

        // Check role
        if (requiredRoles && requiredRoles.length > 0) {
          if (this.authService.hasRole(requiredRoles)) {
            return true;
          }
        }

        // Check permission
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
