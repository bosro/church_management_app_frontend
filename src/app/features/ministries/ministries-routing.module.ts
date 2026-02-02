// src/app/features/ministries/ministries-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MinistryList } from './components/ministry-list/ministry-list';
import { CreateMinistry } from './components/create-ministry/create-ministry/create-ministry';
import { MinistryDetail } from './components/ministry-detail/ministry-detail';
import { EditMinistry } from './components/edit-ministry/edit-ministry./edit-ministry.';


const routes: Routes = [
  { path: '', component: MinistryList },
  { path: 'create', component: CreateMinistry },
  { path: ':id', component: MinistryDetail },
  { path: ':id/edit', component: EditMinistry }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MinistriesRoutingModule { }
