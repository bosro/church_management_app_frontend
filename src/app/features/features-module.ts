import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../core/guards/auth-guard';
import { RoleGuard } from '../core/guards/role-guard';
import { Features } from './features/features';

const routes: Routes = [
  {
    path: '',
    component: Features,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },

      {
        path: 'dashboard',
        loadChildren: () =>
          import('./dashboard/dashboard-module').then((m) => m.DashboardModule),
      },
      {
        path: 'members',
        canActivate: [RoleGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
        },
        loadChildren: () =>
          import('./members/members-module').then((m) => m.MembersModule),
      },
      {
        path: 'attendance',
        canActivate: [RoleGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
        },
        loadChildren: () =>
          import('./attendance/attendance-module').then(
            (m) => m.AttendanceModule,
          ),
      },
      {
        path: 'finance',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin', 'finance_officer'] },
        loadChildren: () =>
          import('./finance/finance-module').then((m) => m.FinanceModule),
      },
      {
        path: 'forms',
        loadChildren: () =>
          import('./forms/forms-module').then((m) => m.FormsModule),
      },
      {
        path: 'ministries',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin', 'pastor'] },
        loadChildren: () =>
          import('./ministries/ministries-module').then(
            (m) => m.MinistriesModule,
          ),
      },

      {
        path: 'branches',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
        loadChildren: () =>
          import('./branches/branches-module').then((m) => m.BranchesModule),
      },

      {
        path: 'events',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin', 'pastor'] },
        loadChildren: () =>
          import('./events/events-module').then((m) => m.EventsModule),
      },
      {
        path: 'communications',
        loadChildren: () =>
          import('./communications/communications-module').then(
            (m) => m.CommunicationsModule,
          ),
      },
      {
        path: 'user-roles',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
        loadChildren: () =>
          import('./user-roles/user-roles-module').then(
            (m) => m.UserRolesModule,
          ),
      },
      {
        path: 'cms',
        loadChildren: () => import('./cms/cms-module').then((m) => m.CmsModule),
      },
      {
        path: 'sermons',
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
        loadChildren: () =>
          import('./sermons/sermons-module').then((m) => m.SermonsModule),
      },
      {
        path: 'settings',
         canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'] },
        loadChildren: () =>
          import('./settings/settings-module').then((m) => m.SettingsModule),

      },
    ],
  },
  {
    path: 'unauthorized',
    redirectTo: '/dashboard',
  },
  {
    path: '**',
    redirectTo: '/dashboard',
  },
];

@NgModule({
  declarations: [Features,],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class FeaturesModule {}
