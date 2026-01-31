// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SermonsListComponent } from './components/sermons-list/sermons-list.component';
import { CreateSermonComponent } from './components/create-sermon/create-sermon.component';
import { EditSermonComponent } from './components/edit-sermon/edit-sermon.component';
import { SermonDetailComponent } from './components/sermon-detail/sermon-detail.component';
import { SermonSeriesComponent } from './components/sermon-series/sermon-series.component';

const routes: Routes = [
  { path: '', component: SermonsListComponent },
  { path: 'create', component: CreateSermonComponent },
  { path: 'series', component: SermonSeriesComponent },
  { path: ':id', component: SermonDetailComponent },
  { path: ':id/edit', component: EditSermonComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SermonsRoutingModule { }
