// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsersList } from './components/users-list/users-list';
import { ManagePermissions } from './components/manage-permissions/manage-permissions';
import { RoleTemplates } from './components/role-templates/role-templates';

const routes: Routes = [
  { path: '', component: UsersList },
  { path: 'manage-permission', component: ManagePermissions },
  { path: 'role-template', component: RoleTemplates },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserRolesRoutingModule {}
