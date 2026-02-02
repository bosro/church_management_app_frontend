// src/app/features/branches/branches-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BranchesList } from './components/branches-list/branches-list/branches-list';
import { CreateBranch } from './components/create-branch/create-branch';
import { BranchDetail } from './components/branch-detail/branch-detail';
import { EditBranch } from './components/edit-branch/edit-branch';


const routes: Routes = [
  { path: '', component: BranchesList },
  { path: 'create', component: CreateBranch },
  { path: ':id', component: BranchDetail },
  { path: ':id/edit', component: EditBranch }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BranchesRoutingModule { }
