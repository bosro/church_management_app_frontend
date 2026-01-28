import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';
import { RoleGuard } from './core/guards/role-guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth-module').then(m => m.AuthModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard-module').then(m => m.DashboardModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'members',
    loadChildren: () => import('./features/members/members-module').then(m => m.MembersModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'attendance',
    loadChildren: () => import('./features/attendance/attendance-module').then(m => m.AttendanceModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'finance',
    loadChildren: () => import('./features/finance/finance-module').then(m => m.FinanceModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'ministries',
    loadChildren: () => import('./features/ministries/ministries-module').then(m => m.MinistriesModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'branches',
    loadChildren: () => import('./features/branches/branches-module').then(m => m.BranchesModule),
    canActivate: [AuthGuard],
    canLoad: [RoleGuard],
    data: { roles: ['super_admin', 'church_admin'] }
  },
  {
    path: 'events',
    loadChildren: () => import('./features/events/events-module').then(m => m.EventsModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'communication',
    loadChildren: () => import('./features/communication/communication-module').then(m => m.CommunicationModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'user-roles',
    loadChildren: () => import('./features/user-roles/user-roles.module').then(m => m.UserRolesModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['super_admin', 'church_admin'] }
  },
  {
    path: 'cms',
    loadChildren: () => import('./features/cms/cms-module').then(m => m.CmsModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['super_admin', 'church_admin'] }
  },
  {
    path: 'settings',
    loadChildren: () => import('./features/settings/settings-module').then(m => m.SettingsModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'unauthorized',
    redirectTo: '/dashboard'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    useHash: false,
    scrollPositionRestoration: 'top'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }

