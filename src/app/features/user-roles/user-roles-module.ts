import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    UsersList,
    ManagePermissions,
    RoleTemplates
  ],
  imports: [
    CommonModule
  ]
})
export class UserRolesModule { }
// src/app/features/user-roles/user-roles.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { UserRolesRoutingModule } from './user-roles-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { UserRolesService } from './services/user-roles.service';

// Components
import { UsersListComponent } from './components/users-list/users-list.component';
import { ManagePermissionsComponent } from './components/manage-permissions/manage-permissions.component';
import { RoleTemplatesComponent } from './components/role-templates/role-templates.component';
import { UsersList } from './components/users-list/users-list';
import { ManagePermissions } from './components/manage-permissions/manage-permissions';
import { RoleTemplates } from './components/role-templates/role-templates';

@NgModule({
  declarations: [
    UsersListComponent,
    ManagePermissionsComponent,
    RoleTemplatesComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    UserRolesRoutingModule
  ],
  providers: [
    UserRolesService
  ]
})
export class UserRolesModule { }
