// src/app/core/guards/role.guard.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map, take, switchMap } from 'rxjs/operators';
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
import { UserRolesService } from '../../features/user-roles/services/user-roles';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate, CanMatch {
  constructor(
    private authService: AuthService,
    private userRolesService: UserRolesService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    const requiredRoles = route.data['roles'] as Array<string>;
    return this.checkAccess(requiredRoles);
  }

  canMatch(
    route: Route,
    segments: UrlSegment[]
  ): Observable<boolean | UrlTree> {
    const requiredRoles = route.data?.['roles'] as Array<string>;
    return this.checkAccess(requiredRoles);
  }

  private checkAccess(requiredRoles?: string[]): Observable<boolean | UrlTree> {
    return this.authService.authReady$.pipe(
      filter(ready => ready === true),
      take(1),
      // Wait for permissions to be loaded too
      switchMap(() => this.userRolesService.permissionsLoaded$),
      filter(loaded => loaded === true),
      take(1),
      map(() => {
        // No role restriction — allow through
        if (!requiredRoles || requiredRoles.length === 0) {
          return true;
        }

        const userRole = this.authService.getCurrentUserRole();

        // Super admin always gets in
        if (userRole === 'super_admin') return true;

        if (this.authService.hasRole(requiredRoles)) {
          return true;
        }

        return this.router.createUrlTree(['/unauthorized']);
      })
    );
  }
}
