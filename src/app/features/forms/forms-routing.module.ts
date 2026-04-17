// src/app/features/forms/forms-routing.module.ts
// KEY FIXES:
// 1. All routes switched from RoleGuard → PermissionGuard
// 2. Missing senior_pastor, associate_pastor, group_leader etc. added to view routes
// 3. All staff roles added to ':id/fill' — any authenticated staff can fill forms
// 4. 'create' confirmed before ':id' param routes (correct order preserved)
// NOTE: The original file header incorrectly said "finance-routing.module.ts"
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { FormsList } from './components/forms-list/forms-list';
import { CreateForm } from './components/create-form/create-form';
import { FormSubmissions } from './components/form-submissions/form-submissions';
import { FillForm } from './components/fill-form/fill-form';
import { EditForm } from './components/edit-form/edit-form';

// All staff + members can VIEW and FILL forms
const FORMS_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'group_leader', 'cell_leader',
  'finance_officer', 'elder', 'deacon', 'worship_leader', 'secretary',
  'member',
];

// Only staff can CREATE, EDIT, and VIEW submissions
const FORMS_MANAGE_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'group_leader',
];

const routes: Routes = [
  {
    path: '',
    component: FormsList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Forms',
      permission: 'forms.view',
      roles: FORMS_VIEW_ROLES,
    },
  },
  // Static 'create' path must come before ':id' param routes
  {
    path: 'create',
    component: CreateForm,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Form',
      permission: 'forms.manage',
      roles: FORMS_MANAGE_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditForm,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Form',
      permission: 'forms.manage',
      roles: FORMS_MANAGE_ROLES,
    },
  },
  {
    path: ':id/fill',
    component: FillForm,
    canActivate: [PermissionGuard],
    data: {
      title: 'Fill Form',
      permission: 'forms.view',
      // All staff and members can fill forms
      roles: FORMS_VIEW_ROLES,
    },
  },
  {
    path: ':id/submissions',
    component: FormSubmissions,
    canActivate: [PermissionGuard],
    data: {
      title: 'Form Submissions',
      permission: 'forms.view',
      roles: FORMS_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FormsRoutingModule {}
