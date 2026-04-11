// src/app/features/cells/cells-module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { CellsList } from './cells-list/cells-list';
import { CellRoutingModule } from './cells-routing-module';
import { SharedModule } from '../../shared/shared-module';



@NgModule({
  declarations: [CellsList],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CellRoutingModule,
    SharedModule
  ],
})
export class CellsModule {}
