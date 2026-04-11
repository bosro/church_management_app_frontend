// src/app/features/job-hub/job-hub-module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { JobHubList } from './components/job-hub-list/job-hub-list';
import { JobHubDetail } from './components/job-hub-detail/job-hub-detail';
import { JobHubManage } from './components/job-hub-manage/job-hub-manage';
import { JobHubRoutingModule } from './job-hub-routing.module';



@NgModule({
  declarations: [JobHubList, JobHubDetail, JobHubManage],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    JobHubRoutingModule
  ],
})
export class JobHubModule {}
