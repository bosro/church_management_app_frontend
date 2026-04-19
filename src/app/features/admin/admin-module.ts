// src/app/features/admin/admin-module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignupRequests } from './signup-requests/signup-requests';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role-guard';
import { Users } from './users/users/users';
import { Churches } from './churches/churches';
import { SharedModule } from '../../shared/shared-module';
import { AdminLayout } from './admin-layout/admin-layout';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';
import { Plans } from './plans/plans'; // ← ADD

const routes: Routes = [
  {
    path: '',
    component: AdminLayout,
    canActivate: [RoleGuard],
    data: { roles: ['super_admin'] },
    children: [
      { path: 'dashboard', component: SuperAdminDashboard },
      { path: 'signup-requests', component: SignupRequests },
      { path: 'users', component: Users },
      { path: 'churches', component: Churches },
      { path: 'plans', component: Plans }, // ← ADD
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  declarations: [
    SignupRequests,
    Users,
    Churches,
    AdminLayout,
    SuperAdminDashboard,
    Plans, // ← ADD (removed duplicate AdminLayout)
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



