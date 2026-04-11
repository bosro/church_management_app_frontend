import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { VotingList } from "./components/voting-list/voting-list";
import { VotingManage } from "./components/voting-manage/voting-manage";
import { VotingDetail } from "./components/voting-detail/voting-detail";

const routes: Routes = [
  { path: '', component: VotingList },
  { path: 'manage', component: VotingManage },
  { path: 'manage/:id', component: VotingManage },
  { path: ':id', component: VotingDetail },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule,]
})
export class VotingRoutingModule { }
