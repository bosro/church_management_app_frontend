import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MinistryList } from './components/ministry-list/ministry-list';
import { MinistryDetail } from './components/ministry-detail/ministry-detail';
import { AddMinistry } from './components/add-ministry/add-ministry';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { CreateMinistry } from './components/create-ministry/create-ministry/create-ministry';
import { EditMinistry } from './components/edit-ministry/edit-ministry./edit-ministry.';

@NgModule({
  declarations: [
    MinistryList,
    MinistryDetail,
    AddMinistry,
    CreateMinistry,
    EditMinistry,
  ],
  imports: [CommonModule, ReactiveFormsModule, SharedModule,MinistriesRoutingModule],
})
export class MinistriesModule {}
