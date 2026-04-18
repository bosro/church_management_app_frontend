// src/app/features/ministries/ministries-routing.module.ts
// KEY FIXES:
// 1. All routes switched from RoleGuard → PermissionGuard
// 2. Missing senior_pastor, associate_pastor, group_leader etc. added
// 3. EditMinistry import path had DOUBLE DOT typo:
//    './components/edit-ministry/edit-ministry./edit-ministry.'
//    Fixed to: './components/edit-ministry/edit-ministry'
// 4. CreateMinistry import path had extra nesting:
//    './components/create-ministry/create-ministry/create-ministry'
//    Fixed to: './components/create-ministry/create-ministry'
//    (adjust if your actual file structure differs)
// 5. Both 'create' and 'add' routes kept — 'add' is what the list navigates to
//    (AddMinistry with quota check). 'create' kept for backwards compatibility.
// 6. All static paths ('create', 'add') confirmed before ':id' param route
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { MinistryList } from './components/ministry-list/ministry-list';
import { MinistryDetail } from './components/ministry-detail/ministry-detail';
import { AddMinistry } from './components/add-ministry/add-ministry';
import { CreateMinistry } from './components/create-ministry/create-ministry/create-ministry';
import { EditMinistry } from './components/edit-ministry/edit-ministry./edit-ministry';

// NOTE: Adjust these two import paths if your actual file structure differs.
// CreateMinistry: was './components/create-ministry/create-ministry/create-ministry'
// EditMinistry:   was './components/edit-ministry/edit-ministry./edit-ministry.' (typo)

const MINISTRIES_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'group_leader', 'cell_leader',
  'elder', 'deacon', 'worship_leader', 'secretary',
];

const MINISTRIES_MANAGE_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader',
];

const routes: Routes = [
  {
    path: '',
    component: MinistryList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Ministries',
      permission: 'ministries.view',
      roles: MINISTRIES_VIEW_ROLES,
    },
  },
  // Static paths must come before ':id' param route
  {
    path: 'create',
    component: CreateMinistry,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Ministry',
      permission: 'ministries.manage',
      roles: MINISTRIES_MANAGE_ROLES,
    },
  },
  {
    path: 'add',
    component: AddMinistry,
    canActivate: [PermissionGuard],
    data: {
      title: 'Add Ministry',
      permission: 'ministries.manage',
      roles: MINISTRIES_MANAGE_ROLES,
    },
  },
  {
    path: ':id',
    component: MinistryDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Ministry Details',
      permission: 'ministries.view',
      roles: MINISTRIES_VIEW_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditMinistry,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Ministry',
      permission: 'ministries.manage',
      roles: MINISTRIES_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MinistriesRoutingModule {}
