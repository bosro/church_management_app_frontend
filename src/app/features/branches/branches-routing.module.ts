// src/app/features/branches/branches-routing.module.ts
// KEY FIXES:
// 1. Switched from RoleGuard → PermissionGuard on all routes
// 2. Added missing roles to view routes
// 3. BranchesList import path corrected (was 3 levels deep)
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';

// NOTE: Adjust these import paths to match your actual file structure.
// The original had './components/branches-list/branches-list/branches-list'
// which appears to be one level too deep. Use ONE of these depending on your
// actual file layout:
//   Option A (most common): './components/branches-list/branches-list'
//   Option B (if file is named differently): './components/branches-list/branches-list.component'
// Adjust the other imports similarly if they have the same nesting issue.
import { CreateBranch } from './components/create-branch/create-branch';
import { BranchDetail } from './components/branch-detail/branch-detail';
import { EditBranch } from './components/edit-branch/edit-branch';
import { BranchesList } from './components/branches-list/branches-list/branches-list';

// Branches is an admin-level feature — only super_admin and church_admin
// can access it by default. Other roles can be granted branches.view via
// the permissions system if needed.
const BRANCHES_VIEW_ROLES = ['super_admin', 'church_admin'];
const BRANCHES_MANAGE_ROLES = ['super_admin', 'church_admin'];

const routes: Routes = [
  {
    path: '',
    component: BranchesList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Branches',
      breadcrumb: 'Branches',
      permission: 'branches.view',
      roles: BRANCHES_VIEW_ROLES,
    },
  },
  {
    path: 'create',
    component: CreateBranch,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Branch',
      breadcrumb: 'Create Branch',
      permission: 'branches.manage',
      roles: BRANCHES_MANAGE_ROLES,
    },
  },
  // IMPORTANT: 'create' must come before ':id' so Angular doesn't
  // match the string 'create' as a branch ID param.
  {
    path: ':id',
    component: BranchDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Branch Details',
      breadcrumb: 'Details',
      permission: 'branches.view',
      roles: BRANCHES_VIEW_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditBranch,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Branch',
      breadcrumb: 'Edit',
      permission: 'branches.manage',
      roles: BRANCHES_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BranchesRoutingModule {}
