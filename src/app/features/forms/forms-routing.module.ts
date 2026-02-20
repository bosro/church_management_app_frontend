// src/app/features/finance/finance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FormsList } from './components/forms-list/forms-list';
import { CreateForm } from './components/create-form/create-form';
import { FormSubmissions } from './components/form-submissions/form-submissions';
import { FillForm } from './components/fill-form/fill-form';
import { EditForm } from './components/edit-form/edit-form';
import { RoleGuard } from '../../core/guards/role-guard';


const routes: Routes = [
  {
    path: '',
    component: FormsList,
    canActivate: [RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'member'],
      title: 'Forms'
    }
  },
  {
    path: 'create',
    component: CreateForm,
    canActivate: [RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Create Form'
    }
  },
  {
    path: ':id/edit',
    component: EditForm,
    canActivate: [RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Edit Form'
    }
  },
  {
    path: ':id/fill',
    component: FillForm,
    canActivate: [RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'member'],
      title: 'Fill Form'
    }
  },
  {
    path: ':id/submissions',
    component: FormSubmissions,
    canActivate: [RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Form Submissions'
    }
  }
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FormsRoutingModule { }
