// src/app/features/ministries/ministries-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MinistryList } from './components/ministry-list/ministry-list';
import { CreateMinistry } from './components/create-ministry/create-ministry/create-ministry';
import { MinistryDetail } from './components/ministry-detail/ministry-detail';
import { EditMinistry } from './components/edit-ministry/edit-ministry./edit-ministry.';
import { RoleGuard } from '../../core/guards/role-guard';
import { AddMinistry } from './components/add-ministry/add-ministry';


const routes: Routes = [
  {
    path: '',
    component: MinistryList,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'],
      title: 'Ministries'
    }
  },
  {
    path: 'create',
    component: CreateMinistry,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Create Ministry'
    }
  },
  {
    path: 'add',
    component: AddMinistry,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Add Ministry'
    }
  },
  {
    path: ':id',
    component: MinistryDetail,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'],
      title: 'Ministry Details'
    }
  },
  {
    path: ':id/edit',
    component: EditMinistry,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
      title: 'Edit Ministry'
    }
  }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MinistriesRoutingModule { }
