// src/app/app-routing-module.ts  — COMPLETE FILE
// Order matters: the church-website route ('' + ':slug') matches ANY single word,
// so 'two-factor' (and every other fixed route) must come BEFORE it.
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';
import { Unauthorized } from './shared/components/unauthorized/unauthorized';
import { AccountPaused } from './shared/components/account-paused/account-paused';

const routes: Routes = [
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./auth/auth-module').then((m) => m.AuthModule) },
  { path: 'public', loadChildren: () => import('./features/public/public.module').then((m) => m.PublicModule) },
  { path: 'main', loadChildren: () => import('./features/features-module').then((m) => m.FeaturesModule), canActivate: [AuthGuard] },
  { path: 'two-factor', loadChildren: () => import('./features/two-factor/two-factor-module').then((m) => m.TwoFactorModule) },
  { path: 'unauthorized', component: Unauthorized },
  { path: 'account-paused', component: AccountPaused },

  // Church websites: /website-builder and /<church-slug>  (keep AFTER all fixed routes above)
  { path: '', loadChildren: () => import('./features/site/site-module').then((m) => m.SiteModule) },

  { path: '**', redirectTo: 'main' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: false, scrollPositionRestoration: 'enabled', enableTracing: false })],
  exports: [RouterModule],
})
export class AppRoutingModule { }