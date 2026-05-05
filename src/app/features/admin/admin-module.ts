// src/app/features/admin/admin-module.ts  ← FULL REPLACEMENT
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role-guard';
import { SharedModule } from '../../shared/shared-module';

import { AdminLayout }         from './admin-layout/admin-layout';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';
import { SignupRequests }       from './signup-requests/signup-requests';
import { Users }               from './users/users/users';
import { Churches }            from './churches/churches';
import { Plans }               from './plans/plans';
import { Finance } from './admin-layout/finance/finance';

const routes: Routes = [
  {
    path: '',
    component: AdminLayout,
    canActivate: [RoleGuard],
    data: { roles: ['super_admin'] },
    children: [
      { path: 'dashboard',        component: SuperAdminDashboard },
      { path: 'signup-requests',  component: SignupRequests      },
      { path: 'users',            component: Users               },
      { path: 'churches',         component: Churches            },
      { path: 'plans',            component: Plans               },
      { path: 'finance',          component: Finance   }, // ← NEW
      { path: '',                 redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  declarations: [
    AdminLayout,
    SuperAdminDashboard,
    SignupRequests,
    Users,
    Churches,
    Plans,
    Finance,   // ← NEW
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    RouterModule.forChild(routes),
  ],
})
export class AdminModule {}
