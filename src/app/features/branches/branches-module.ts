import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Branches } from './services/branches/branches';



@NgModule({
  declarations: [
    Branches,
    BranchesList,
    CreateBranch,
    EditBranch,
    BranchDetail
  ],
  imports: [
    CommonModule
  ]
})
export class BranchesModule { }
// src/app/features/branches/branches.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { BranchesRoutingModule } from './branches-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { BranchesService } from './services/branches.service';

// Components
import { BranchesListComponent } from './components/branches-list/branches-list.component';
import { CreateBranchComponent } from './components/create-branch/create-branch.component';
import { EditBranchComponent } from './components/edit-branch/edit-branch.component';
import { BranchDetailComponent } from './components/branch-detail/branch-detail.component';
import { BranchesList } from './components/branches-list/branches-list/branches-list';
import { CreateBranch } from './components/create-branch/create-branch';
import { EditBranch } from './components/edit-branch/edit-branch';
import { BranchDetail } from './components/branch-detail/branch-detail';

@NgModule({
  declarations: [
    BranchesListComponent,
    CreateBranchComponent,
    EditBranchComponent,
    BranchDetailComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    BranchesRoutingModule
  ],
  providers: [
    BranchesService
  ]
})
export class BranchesModule { }
