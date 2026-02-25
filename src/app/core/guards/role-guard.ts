// src/app/core/guards/role.guard.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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
  ): Observable<boolean> | Promise<boolean> | boolean {
    const requiredRoles = route.data['roles'] as Array<string>;

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (this.authService.hasRole(requiredRoles)) {
      return true;
    }

    // Redirect to unauthorized page
    this.router.navigate(['/unauthorized']);
    return false;
  }

  canMatch(
    route: Route,
    segments: UrlSegment[]
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    const requiredRoles = route.data?.['roles'] as Array<string>;

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (this.authService.hasRole(requiredRoles)) {
      return true;
    }

    // Redirect to unauthorized page
    return this.router.createUrlTree(['/unauthorized']);
  }
}


