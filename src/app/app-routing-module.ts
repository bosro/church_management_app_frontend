// src/app/app-routing.module.ts
// FIXED VERSION - Clearer routing hierarchy

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';
import { Unauthorized } from './shared/components/unauthorized/unauthorized';
import { MemberRegistration } from './features/public/member-registration/member-registration';
import { LinkCheckin } from './features/public/link-checkin/link-checkin';

const routes: Routes = [
  // Default: redirect to auth
  {
    path: '',
    redirectTo: 'main',
    pathMatch: 'full',
  },
  // Auth routes (login, signup, etc.)
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth-module').then((m) => m.AuthModule),
  },
  {
    path: 'public',
    loadChildren: () =>
      import('./features/public/public.module').then((m) => m.PublicModule),
  },

  // Protected main app routes
  {
    path: 'main',
    loadChildren: () =>
      import('./features/features-module').then((m) => m.FeaturesModule),
    canActivate: [AuthGuard],
  },

  {
    path: 'unauthorized',
    component: Unauthorized,
  },
  // Catch-all: redirect to auth instead of creating a loop
  {
    path: '**',
    redirectTo: 'main',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      useHash: false,
      scrollPositionRestoration: 'enabled', // restores position on back/forward, doesn't force-reset on new nav
      enableTracing: false,
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
