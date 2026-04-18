// src/app/features/features-routing.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../core/guards/auth-guard';
import { PermissionGuard } from '../core/guards/permission.guard';
import { Features } from './features/features';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Comprehensive role lists used across multiple routes
const ALL_STAFF_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'ministry_leader',
  'group_leader',
  'cell_leader',
  'finance_officer',
  'elder',
  'deacon',
  'worship_leader',
  'secretary',
];

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

      // Members — any staff role OR members.view permission
      {
        path: 'members',
        canActivate: [PermissionGuard],
        data: {
          permission: 'members.view',
          roles: [...ALL_STAFF_ROLES, 'member'],
        },
        loadChildren: () =>
          import('./members/members-module').then((m) => m.MembersModule),
      },

      // Attendance — any staff role OR attendance.view permission
      {
        path: 'attendance',
        canActivate: [PermissionGuard],
        data: {
          permission: 'attendance.view',
          roles: ALL_STAFF_ROLES,
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
          permission: 'finance.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'finance_officer',
          ],
        },
        loadChildren: () =>
          import('./finance/finance-module').then((m) => m.FinanceModule),
      },

      // Forms — role OR permission
      {
        path: 'forms',
        canActivate: [PermissionGuard],
        data: {
          permission: 'forms.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'ministry_leader',
            'group_leader',
          ],
        },
        loadChildren: () =>
          import('./forms/forms-module').then((m) => m.FormsModule),
      },

      // Ministries / Departments — role OR permission
      {
        path: 'ministries',
        canActivate: [PermissionGuard],
        data: {
          permission: 'ministries.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'ministry_leader',
            'group_leader',
            'cell_leader',
            'elder',
            'deacon',
            'worship_leader',
          ],
        },
        loadChildren: () =>
          import('./ministries/ministries-module').then(
            (m) => m.MinistriesModule,
          ),
      },

      // Branches — admin only
      {
        path: 'branches',
        canActivate: [PermissionGuard],
        data: {
          permission: 'branches.view',
          roles: ['super_admin', 'church_admin'],
        },
        loadChildren: () =>
          import('./branches/branches-module').then((m) => m.BranchesModule),
      },

      // Cell Groups — any staff role OR members.view permission
      {
        path: 'cells',
        canActivate: [PermissionGuard],
        data: {
          permission: 'members.view',
          roles: ALL_STAFF_ROLES,
        },
        loadChildren: () =>
          import('./cells/cells-module').then((m) => m.CellsModule),
      },

      // Events — any staff role OR events.view permission
      {
        path: 'events',
        canActivate: [PermissionGuard],
        data: {
          permission: 'events.view',
          roles: ALL_STAFF_ROLES,
        },
        loadChildren: () =>
          import('./events/events-module').then((m) => m.EventsModule),
      },

      // Communications — role OR permission
      {
        path: 'communications',
        canActivate: [PermissionGuard],
        data: {
          permission: 'communications.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
          ],
        },
        loadChildren: () =>
          import('./communications/communications-module').then(
            (m) => m.CommunicationsModule,
          ),
      },

      // User Roles — admin only (this IS the permission manager)
      {
        path: 'user-roles',
        canActivate: [PermissionGuard],
        data: { roles: ['super_admin', 'church_admin'] },
        loadChildren: () =>
          import('./user-roles/user-roles-module').then(
            (m) => m.UserRolesModule,
          ),
      },

      // CMS — no guard (open)
      {
        path: 'cms',
        loadChildren: () => import('./cms/cms-module').then((m) => m.CmsModule),
      },

      // Sermons — role OR permission
      {
        path: 'sermons',
        canActivate: [PermissionGuard],
        data: {
          permission: 'sermons.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'worship_leader',
          ],
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
          permission: 'settings.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'finance_officer',
            'member',
          ],
        },
        loadChildren: () =>
          import('./settings/settings-module').then((m) => m.SettingsModule),
      },

      // Voting — feature-flagged, all staff + member roles
      {
        path: 'voting',
        canActivate: [PermissionGuard],
        data: {
          requiresFeature: 'voting',
          roles: [...ALL_STAFF_ROLES, 'member'],
        },
        loadChildren: () =>
          import('./voting/voting-module').then((m) => m.VotingModule),
      },

      // Job Hub — feature-flagged, all staff + member roles
      // FIXED: was duplicated — merged into single route with requiresFeature only
      {
        path: 'job-hub',
        canActivate: [PermissionGuard],
        data: {
          requiresFeature: 'job_hub',
          roles: [...ALL_STAFF_ROLES, 'member'],
        },
        loadChildren: () =>
          import('./job-hub/job-hub-module').then((m) => m.JobHubModule),
      },

      // Reports (school management)
      {
        path: 'reports',
        canActivate: [PermissionGuard],
        data: {
          requiresFeature: 'reports',
          permission: 'reports.view',
          roles: [
            'super_admin',
            'church_admin',
            'pastor',
            'senior_pastor',
            'associate_pastor',
            'finance_officer',
          ],
        },
        loadChildren: () =>
          import('./reports/reports-module').then((m) => m.ReportsModule),
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
