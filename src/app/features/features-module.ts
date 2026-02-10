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
        loadChildren: () =>
          import('./members/members-module').then((m) => m.MembersModule),
      },
      {
        path: 'attendance',
        loadChildren: () =>
          import('./attendance/attendance-module').then(
            (m) => m.AttendanceModule,
          ),
      },
      {
        path: 'finance',
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
        loadChildren: () =>
          import('./ministries/ministries-module').then(
            (m) => m.MinistriesModule,
          ),
      },

      {
        path: 'branches',
        loadChildren: () =>
          import('./branches/branches-module').then((m) => m.BranchesModule),
        canMatch: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
      },

      {
        path: 'events',
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
        loadChildren: () =>
          import('./user-roles/user-roles-module').then(
            (m) => m.UserRolesModule,
          ),
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
      },
      {
        path: 'cms',
        loadChildren: () => import('./cms/cms-module').then((m) => m.CmsModule),
        canActivate: [RoleGuard],
        data: { roles: ['super_admin', 'church_admin'] },
      },
      {
        path: 'sermon',
        loadChildren: () =>
          import('./sermons/sermons-module').then((m) => m.SermonsModule),
      },
      {
        path: 'settings',
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
  declarations: [Features],
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class FeaturesModule {}
