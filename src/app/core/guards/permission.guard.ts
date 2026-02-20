// // src/app/core/guards/permission.guard.ts
// import { Injectable } from '@angular/core';
// import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
// import { AuthService } from '../services/auth';

// @Injectable({
//   providedIn: 'root'
// })
// export class PermissionGuard implements CanActivate {
//   constructor(
//     private authService: AuthService,
//     private router: Router
//   ) {}

//   canActivate(route: ActivatedRouteSnapshot): boolean {
//     const requiredPermissions = route.data['permissions'] as string[];

//     if (!requiredPermissions || requiredPermissions.length === 0) {
//       return true;
//     }

//     const hasPermission = this.authService.hasAnyPermission(requiredPermissions);

//     if (!hasPermission) {
//       this.router.navigate(['/unauthorized']);
//       return false;
//     }

//     return true;
//   }
// }
