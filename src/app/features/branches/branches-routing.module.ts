// src/app/features/branches/branches-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BranchesListComponent } from './components/branches-list/branches-list.component';
import { CreateBranchComponent } from './components/create-branch/create-branch.component';
import { EditBranchComponent } from './components/edit-branch/edit-branch.component';
import { BranchDetailComponent } from './components/branch-detail/branch-detail.component';

const routes: Routes = [
  { path: '', component: BranchesListComponent },
  { path: 'create', component: CreateBranchComponent },
  { path: ':id', component: BranchDetailComponent },
  { path: ':id/edit', component: EditBranchComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BranchesRoutingModule { }
