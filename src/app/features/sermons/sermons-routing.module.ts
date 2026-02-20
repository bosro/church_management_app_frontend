// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SermonsList } from './components/sermons-list/sermons-list';
import { CreateSermon } from './components/create-sermon/create-sermon';
import { EditSermon } from './components/edit-sermon/edit-sermon';
import { SermonDetail } from './components/sermon-detail/sermon-detail';
import { RoleGuard } from '../../core/guards/role-guard';


const routes: Routes = [
  {
    path: '',
    component: SermonsList,
    canActivate: [],
    data: {
      title: 'Sermons'
    }
  },
  {
    path: 'create',
    component: CreateSermon,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'media_team'],
      title: 'Upload Sermon'
    }
  },
  {
    path: ':id',
    component: SermonDetail,
    canActivate: [],
    data: {
      title: 'Sermon Details'
    }
  },
  {
    path: ':id/edit',
    component: EditSermon,
    canActivate: [ RoleGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'media_team'],
      title: 'Edit Sermon'
    }
  }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SermonsRoutingModule { }
