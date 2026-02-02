// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SermonsList } from './components/sermons-list/sermons-list';
import { CreateSermon } from './components/create-sermon/create-sermon';
import { EditSermon } from './components/edit-sermon/edit-sermon';
import { SermonDetail } from './components/sermon-detail/sermon-detail';


const routes: Routes = [
  { path: '', component: SermonsList },
  { path: 'create', component: CreateSermon },
  // { path: 'series', component: SermonSeries },
  { path: ':id', component: SermonDetail },
  { path: ':id/edit', component: EditSermon }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SermonsRoutingModule { }
