// src/app/features/ministries/ministries-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MinistriesListComponent } from './components/ministries-list/ministries-list.component';
import { MinistryDetailComponent } from './components/ministry-detail/ministry-detail.component';
import { CreateMinistryComponent } from './components/create-ministry/create-ministry.component';
import { EditMinistryComponent } from './components/edit-ministry/edit-ministry.component';

const routes: Routes = [
  { path: '', component: MinistriesListComponent },
  { path: 'create', component: CreateMinistryComponent },
  { path: ':id', component: MinistryDetailComponent },
  { path: ':id/edit', component: EditMinistryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MinistriesRoutingModule { }
