import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { CreateForm } from './components/create-form/create-form';
import { EditForm } from './components/edit-form/edit-form';
import { FillForm } from './components/fill-form/fill-form';
import { FormSubmissions } from './components/form-submissions/form-submissions';
import { FormsList } from './components/forms-list/forms-list';
import { FormsRoutingModule } from './forms-routing.module';



@NgModule({
  declarations: [
    FormsList,
    CreateForm,
    EditForm,
    FillForm,
    FormSubmissions
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    FormsRoutingModule
  ]
})
export class FormsModule { }


