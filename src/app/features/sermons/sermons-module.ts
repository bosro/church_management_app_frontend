import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SermonsRoutingModule } from './sermons-routing.module';
import { SharedModule } from '../../shared/shared-module';
import { SermonsList } from './components/sermons-list/sermons-list';
import { CreateSermon } from './components/create-sermon/create-sermon';
import { EditSermon } from './components/edit-sermon/edit-sermon';
import { SermonDetail } from './components/sermon-detail/sermon-detail';



@NgModule({
  declarations: [
    SermonsList,
    CreateSermon,
    EditSermon,
    SermonDetail
  ],
  imports: [
    CommonModule,
      ReactiveFormsModule,
    FormsModule,
    SharedModule,
    SermonsRoutingModule
  ]
})
export class SermonsModule { }

