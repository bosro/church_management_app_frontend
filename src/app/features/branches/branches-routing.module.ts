// src/app/features/branches/branches-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BranchesList } from './components/branches-list/branches-list/branches-list';
import { CreateBranch } from './components/create-branch/create-branch';
import { BranchDetail } from './components/branch-detail/branch-detail';
import { EditBranch } from './components/edit-branch/edit-branch';
import { RoleGuard } from '../../core/guards/role-guard';


const routes: Routes = [
  {
    path: '',
    component: BranchesList,
    canActivate: [ RoleGuard],
    data: {
      title: 'Branches',
      breadcrumb: 'Branches',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: 'create',
    component: CreateBranch,
    canActivate: [ RoleGuard],
    data: {
      title: 'Create Branch',
      breadcrumb: 'Create Branch',
      roles: ['super_admin', 'church_admin']
    }
  },
  {
    path: ':id',
    component: BranchDetail,
    canActivate: [ RoleGuard],
    data: {
      title: 'Branch Details',
      breadcrumb: 'Details',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: ':id/edit',
    component: EditBranch,
    canActivate: [ RoleGuard],
    data: {
      title: 'Edit Branch',
      breadcrumb: 'Edit',
      roles: ['super_admin', 'church_admin']
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BranchesRoutingModule { }
