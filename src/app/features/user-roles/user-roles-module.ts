import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersList } from './components/users-list/users-list';
import { ManagePermissions } from './components/manage-permissions/manage-permissions';
import { RoleTemplates } from './components/role-templates/role-templates';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { UserRolesRoutingModule } from './user-roles-routing.module';



@NgModule({
  declarations: [
    UsersList,
    ManagePermissions,
    RoleTemplates
  ],
  imports: [
    CommonModule,
     ReactiveFormsModule,
    FormsModule,
    SharedModule,
    UserRolesRoutingModule
  ]
})
export class UserRolesModule { }

