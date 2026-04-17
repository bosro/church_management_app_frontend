// src/app/features/members/members-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MemberList } from './components/member-list/member-list';
import { AddMember } from './components/add-member/add-member';
import { EditMember } from './components/edit-member/edit-member';
import { ImportMembers } from './components/import-members/import-members';
import { MemberDetail } from './components/member-detail/member-detail';
import { RegistrationLinks } from './components/registration-links/registration-links';
import { PermissionGuard } from '../../core/guards/permission.guard';

// All roles that can view members in any capacity
const ALL_MEMBER_VIEW_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'ministry_leader',
  'group_leader',
  'cell_leader',
  'finance_officer',
  'elder',
  'deacon',
  'worship_leader',
  'secretary',
];

// Roles that can create/add members
const MEMBER_CREATE_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'group_leader',
  'cell_leader',
];

// Roles that can edit members
const MEMBER_EDIT_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
];

// Roles that can import members
const MEMBER_IMPORT_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
];

const routes: Routes = [
  {
    path: '',
    component: MemberList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Members',
      permission: 'members.view',
      roles: ALL_MEMBER_VIEW_ROLES,
    },
  },
  {
    path: 'add',
    component: AddMember,
    canActivate: [PermissionGuard],
    data: {
      title: 'Add Member',
      permission: 'members.create',
      roles: MEMBER_CREATE_ROLES,
    },
  },
  {
    path: 'import',
    component: ImportMembers,
    canActivate: [PermissionGuard],
    data: {
      title: 'Import Members',
      permission: 'members.import',
      roles: MEMBER_IMPORT_ROLES,
    },
  },
  {
    path: 'registration-links',
    component: RegistrationLinks,
    canActivate: [PermissionGuard],
    data: {
      title: 'Registration Links',
      permission: 'members.import',
      roles: MEMBER_IMPORT_ROLES,
    },
  },
  {
    path: ':id',
    component: MemberDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Member Details',
      permission: 'members.view',
      roles: ALL_MEMBER_VIEW_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditMember,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Member',
      permission: 'members.edit',
      roles: MEMBER_EDIT_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MembersRoutingModule {}
