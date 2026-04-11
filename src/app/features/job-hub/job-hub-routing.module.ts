import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { JobHubList } from "./components/job-hub-list/job-hub-list";
import { JobHubManage } from "./components/job-hub-manage/job-hub-manage";
import { JobHubDetail } from "./components/job-hub-detail/job-hub-detail";

const routes: Routes = [
  { path: '', component: JobHubList },
  { path: 'manage', component: JobHubManage },
  { path: 'manage/:id', component: JobHubManage },
  { path: ':id', component: JobHubDetail },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule,]
})
export class JobHubRoutingModule { }
