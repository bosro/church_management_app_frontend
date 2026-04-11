// src/app/features/voting/voting-module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { VotingRoutingModule } from './voting-module-routing';
import { VotingList } from './components/voting-list/voting-list';
import { VotingDetail } from './components/voting-detail/voting-detail';
import { VotingManage } from './components/voting-manage/voting-manage';



@NgModule({
  declarations: [VotingList, VotingDetail, VotingManage],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    VotingRoutingModule
  ],
})
export class VotingModule {}
