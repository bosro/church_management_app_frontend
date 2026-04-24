// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsersList } from './components/users-list/users-list';
import { ManagePermissions } from './components/manage-permissions/manage-permissions';
import { RoleTemplates } from './components/role-templates/role-templates';
import { CreateUser } from './components/create-user/create-user';

const routes: Routes = [
  { path: '', component: UsersList },
  { path: 'create', component: CreateUser },                         // ← ADD
  { path: 'manage-permission/:id/permissions', component: ManagePermissions },
  { path: 'templates', component: RoleTemplates },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserRolesRoutingModule {}


