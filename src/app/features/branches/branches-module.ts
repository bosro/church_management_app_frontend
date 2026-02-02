import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { BranchesRoutingModule } from './branches-routing.module';
import { BranchesList } from './components/branches-list/branches-list/branches-list';
import { CreateBranch } from './components/create-branch/create-branch';
import { EditBranch } from './components/edit-branch/edit-branch';
import { BranchDetail } from './components/branch-detail/branch-detail';



@NgModule({
  declarations: [
    BranchesList,
    CreateBranch,
    EditBranch,
    BranchDetail
  ],
  imports: [
    CommonModule,
      FormsModule,
         ReactiveFormsModule,
    SharedModule,
    BranchesRoutingModule
  ]
})
export class BranchesModule { }
