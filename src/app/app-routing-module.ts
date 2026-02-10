// src/app/app-routing.module.ts
// FIXED VERSION - Clearer routing hierarchy

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';

const routes: Routes = [
  // Default: redirect to auth
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  // Auth routes (login, signup, etc.)
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth-module').then((m) => m.AuthModule),
  },
  // Protected main app routes
  {
    path: 'main',
    loadChildren: () =>
      import('./features/features-module').then((m) => m.FeaturesModule),
    canActivate: [AuthGuard]
  },
  // Catch-all: redirect to auth instead of creating a loop
  {
    path: '**',
    redirectTo: 'auth'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      useHash: false,
      scrollPositionRestoration: 'top',
      enableTracing: false, // Set to true for debugging
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
