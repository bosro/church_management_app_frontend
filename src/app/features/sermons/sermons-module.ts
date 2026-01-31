import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    SermonsList,
    CreateSermon
  ],
  imports: [
    CommonModule
  ]
})
export class SermonsModule { }
// src/app/features/sermons/sermons.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { SermonsRoutingModule } from './sermons-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { SermonsService } from './services/sermons.service';

// Components
import { SermonsListComponent } from './components/sermons-list/sermons-list.component';
import { CreateSermonComponent } from './components/create-sermon/create-sermon.component';
import { EditSermonComponent } from './components/edit-sermon/edit-sermon.component';
import { SermonDetailComponent } from './components/sermon-detail/sermon-detail.component';
import { SermonSeriesComponent } from './components/sermon-series/sermon-series.component';
import { SermonsList } from './components/sermons-list/sermons-list';
import { CreateSermon } from './components/create-sermon/create-sermon';

@NgModule({
  declarations: [
    SermonsListComponent,
    CreateSermonComponent,
    EditSermonComponent,
    SermonDetailComponent,
    SermonSeriesComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    SermonsRoutingModule
  ],
  providers: [
    SermonsService
  ]
})
export class SermonsModule { }
