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

        // ① Super admin bypasses everything
        if (userRole === 'super_admin') return true;

        // ② Check feature flag
        if (
          requiredFeature &&
          !this.authService.hasChurchFeature(requiredFeature)
        ) {
          return this.router.createUrlTree(['/unauthorized']);
        }

        // ③ church_admin always passes
        if (userRole === 'church_admin') return true;

        // ④ Role check — if user's role is in the allowed roles list, let them in
        const hasRole =
          requiredRoles && requiredRoles.length > 0
            ? requiredRoles.includes(userRole)
            : false;

        if (hasRole) return true;

        // ⑤ Permission check — fallback for users without the role
        //    but who have been explicitly granted the permission
        const hasPermission = requiredPermission
          ? this.userRolesService.hasPermission(requiredPermission)
          : false;

        if (hasPermission) return true;

        return this.router.createUrlTree(['/unauthorized']);
      }),
    );
  }
}
