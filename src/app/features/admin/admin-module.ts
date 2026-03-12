import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignupRequests } from './signup-requests/signup-requests';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role-guard';
import { Users } from './users/users/users';
import { Churches } from './churches/churches';


const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'signup-requests',
        component: SignupRequests,
        canActivate: [RoleGuard],
        data: { roles: ['super_admin'] }
      },
      {
        path: 'users',
        component: Users,
        canActivate: [RoleGuard],
        data: { roles: ['super_admin'] }
      },
      {
        path: 'churches',
        component: Churches,
        canActivate: [RoleGuard],
        data: { roles: ['super_admin'] }
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
    Churches
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes)
  ]
})
export class AdminModule { }
