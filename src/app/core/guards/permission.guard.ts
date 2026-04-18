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
import { Observable, combineLatest } from 'rxjs';
import { filter, map, take, switchMap, tap } from 'rxjs/operators';
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
  // console.log('🛡️ GUARD check() called — permission:', requiredPermission, '| roles:', requiredRoles);

  return this.authService.authReady$.pipe(
    tap(ready => console.log('🛡️ authReady$:', ready)),
    filter((ready) => ready === true),
    take(1),
    switchMap(() => {
      // console.log('🛡️ authReady resolved, checking permissionsLoaded$...');
      return this.userRolesService.permissionsLoaded$;
    }),
    tap(loaded => console.log('🛡️ permissionsLoaded$:', loaded)),
    filter((loaded) => loaded === true),
    take(1),
    map(() => {
      const userRole = this.authService.getCurrentUserRole();
      // console.log('🛡️ guard evaluating — userRole:', userRole);
      // console.log('🛡️ requiredRoles includes userRole:', requiredRoles?.includes(userRole));
      // console.log('🛡️ hasPermission:', requiredPermission ? this.userRolesService.hasPermission(requiredPermission) : 'N/A');

      if (userRole === 'super_admin') return true;
      if (requiredFeature && !this.authService.hasChurchFeature(requiredFeature)) {
        return this.router.createUrlTree(['/unauthorized']);
      }
      if (userRole === 'church_admin') return true;
      if (!requiredRoles?.length && !requiredPermission) return true;

      const hasRole = requiredRoles?.length ? requiredRoles.includes(userRole) : false;
      const hasPermission = requiredPermission ? this.userRolesService.hasPermission(requiredPermission) : false;

      if (hasRole || hasPermission) return true;
      return this.router.createUrlTree(['/unauthorized']);
    }),
  );
}
}
