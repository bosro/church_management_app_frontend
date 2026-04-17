// src/app/features/sermons/sermons-routing.module.ts
// KEY FIXES:
// 1. '' and ':id' had canActivate: [] (completely empty) — now have PermissionGuard
// 2. 'create' and ':id/edit' switched from RoleGuard → PermissionGuard
// 3. Removed non-existent 'media_team' role — replaced with 'worship_leader'
//    which is the closest valid role for media/sermon management
// 4. 'create' must come before ':id' to prevent Angular matching 'create' as
//    a sermon ID param — route order preserved correctly
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { SermonsList } from './components/sermons-list/sermons-list';
import { CreateSermon } from './components/create-sermon/create-sermon';
import { EditSermon } from './components/edit-sermon/edit-sermon';
import { SermonDetail } from './components/sermon-detail/sermon-detail';

// All staff roles can VIEW sermons
const SERMONS_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'group_leader', 'cell_leader',
  'finance_officer', 'elder', 'deacon', 'worship_leader', 'secretary',
];

// Only admin, pastor roles can UPLOAD/EDIT sermons
const SERMONS_MANAGE_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'worship_leader', // closest valid equivalent to 'media_team'
];

const routes: Routes = [
  {
    path: '',
    component: SermonsList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Sermons',
      permission: 'sermons.view',
      roles: SERMONS_VIEW_ROLES,
    },
  },
  // IMPORTANT: 'create' must come before ':id'
  {
    path: 'create',
    component: CreateSermon,
    canActivate: [PermissionGuard],
    data: {
      title: 'Upload Sermon',
      permission: 'sermons.upload',
      roles: SERMONS_MANAGE_ROLES,
    },
  },
  {
    path: ':id',
    component: SermonDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Sermon Details',
      permission: 'sermons.view',
      roles: SERMONS_VIEW_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditSermon,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Sermon',
      permission: 'sermons.edit',
      roles: SERMONS_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SermonsRoutingModule {}
