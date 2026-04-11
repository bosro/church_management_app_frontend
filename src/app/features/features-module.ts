// src/app/features/features-routing.module.ts  (replace your current routes array)
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../core/guards/auth-guard';
import { PermissionGuard } from '../core/guards/permission.guard';
import { Features } from './features/features';
import { MemberRegistration } from './public/member-registration/member-registration';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LinkCheckin } from './public/link-checkin/link-checkin';

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

      // Dashboard — all authenticated users
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./dashboard/dashboard-module').then((m) => m.DashboardModule),
      },

      // Super admin only
      {
        path: 'admin',
        canActivate: [PermissionGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () =>
          import('./admin/admin-module').then((m) => m.AdminModule),
      },

      // Members — role OR permission
      {
        path: 'members',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
          permission: 'members.view',
        },
        loadChildren: () =>
          import('./members/members-module').then((m) => m.MembersModule),
      },

      // Attendance — role OR permission
      {
        path: 'attendance',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor', 'group_leader'],
          permission: 'attendance.view',
        },
        loadChildren: () =>
          import('./attendance/attendance-module').then(
            (m) => m.AttendanceModule,
          ),
      },

      // Finance — role OR permission
      {
        path: 'finance',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'finance_officer'],
          permission: 'finance.view',
        },
        loadChildren: () =>
          import('./finance/finance-module').then((m) => m.FinanceModule),
      },

      // Forms — open to all for now, guard per component
      {
        path: 'forms',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor'],
          permission: 'forms.view',
        },
        loadChildren: () =>
          import('./forms/forms-module').then((m) => m.FormsModule),
      },

      // Ministries — role OR permission
      {
        path: 'ministries',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor'],
          permission: 'ministries.view',
        },
        loadChildren: () =>
          import('./ministries/ministries-module').then(
            (m) => m.MinistriesModule,
          ),
      },

      // Branches — role OR permission
      {
        path: 'branches',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin'],
          permission: 'branches.view',
        },
        loadChildren: () =>
          import('./branches/branches-module').then((m) => m.BranchesModule),
      },
      {
        path: 'cells',
        canActivate: [PermissionGuard],
        data: {
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'group_leader',
            'cell_leader',
          ],
          permission: 'members.view',
        },
        loadChildren: () =>
          import('./cells/cells-module').then((m) => m.CellsModule),
      },

      // Events — role OR permission
      {
        path: 'events',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor'],
          permission: 'events.view',
        },
        loadChildren: () =>
          import('./events/events-module').then((m) => m.EventsModule),
      },

      // Communications — role OR permission
      {
        path: 'communications',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin', 'pastor'],
          permission: 'communications.view',
        },
        loadChildren: () =>
          import('./communications/communications-module').then(
            (m) => m.CommunicationsModule,
          ),
      },

      // User Roles — admin only (no permission fallback — this IS the permission manager)
      {
        path: 'user-roles',
        canActivate: [PermissionGuard],
        data: { roles: ['super_admin', 'church_admin'] },
        loadChildren: () =>
          import('./user-roles/user-roles-module').then(
            (m) => m.UserRolesModule,
          ),
      },

      // CMS
      {
        path: 'cms',
        loadChildren: () => import('./cms/cms-module').then((m) => m.CmsModule),
      },

      // Sermons — role OR permission
      {
        path: 'sermons',
        canActivate: [PermissionGuard],
        data: {
          roles: ['super_admin', 'church_admin'],
          permission: 'sermons.view',
        },
        loadChildren: () =>
          import('./sermons/sermons-module').then((m) => m.SermonsModule),
      },

      // My Giving — members only
      {
        path: 'my-giving',
        canActivate: [PermissionGuard],
        data: { roles: ['member'] },
        loadChildren: () =>
          import('./my-giving/my-giving-module').then((m) => m.MyGivingModule),
      },

      // Settings — role OR permission
      {
        path: 'settings',
        canActivate: [PermissionGuard],
        data: {
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'finance_officer',
            'member',
          ],
          permission: 'settings.view',
        },
        loadChildren: () =>
          import('./settings/settings-module').then((m) => m.SettingsModule),
      },

      {
        path: 'voting',
        canActivate: [PermissionGuard],
        data: {
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'member',
            'group_leader',
            'ministry_leader',
            'finance_officer',
            'senior_pastor',
            'associate_pastor',
            'elder',
            'deacon',
            'worship_leader',
          ],
          requiresFeature: 'voting', // ← ADD
        },
        loadChildren: () =>
          import('./voting/voting-module').then((m) => m.VotingModule),
      },
      {
        path: 'job-hub',
        canActivate: [PermissionGuard],
        data: {
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'member',
            'group_leader',
            'ministry_leader',
            'finance_officer',
            'senior_pastor',
            'associate_pastor',
            'elder',
            'deacon',
            'worship_leader',
          ],
          requiresFeature: 'job_hub', // ← ADD
        },
        loadChildren: () =>
          import('./job-hub/job-hub-module').then((m) => m.JobHubModule),
      },

      {
        path: 'job-hub',
        canActivate: [PermissionGuard],
        data: {
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'member',
            'group_leader',
            'ministry_leader',
            'finance_officer',
            'senior_pastor',
            'associate_pastor',
            'elder',
            'deacon',
            'worship_leader',
          ],
          permission: 'job-hub.view',
        },
        loadChildren: () =>
          import('./job-hub/job-hub-module').then((m) => m.JobHubModule),
      },
    ],
  },
  {
    path: 'unauthorized',
    redirectTo: '/unauthorized',
  },
  {
    path: '**',
    redirectTo: '/dashboard',
  },
];

@NgModule({
  declarations: [Features],
  imports: [CommonModule, RouterModule.forChild(routes), ReactiveFormsModule],
})
export class FeaturesModule {}
