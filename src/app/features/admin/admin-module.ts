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


const routes: Routes = [
  {
    path: '',
    component: AdminLayout, // ✅ Wrap in layout
    canActivate: [RoleGuard],
    data: { roles: ['super_admin'] },
    children: [
      {
        path: 'signup-requests',
        component: SignupRequests
      },
      {
        path: 'users',
        component: Users
      },
      {
        path: 'churches',
        component: Churches
      },
      {
        path: '',
        redirectTo: 'signup-requests',
        pathMatch: 'full'
      }
    ]
  }
];


@NgModule({
  declarations: [
    SignupRequests,
    Users,
    Churches,
    AdminLayout,
    AdminLayout
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class AdminModule { }
