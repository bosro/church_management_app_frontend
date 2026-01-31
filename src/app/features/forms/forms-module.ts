import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    FormsList,
    CreateForm,
    EditForm,
    FillForm,
    FormSubmissions
  ],
  imports: [
    CommonModule
  ]
})
export class FormsModule { }


// src/app/features/forms/forms.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule as NgFormsModule } from '@angular/forms';

import { FormsRoutingModule } from './forms-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { FormsService } from './services/forms.service';

// Components
import { FormsListComponent } from './components/forms-list/forms-list.component';
import { CreateFormComponent } from './components/create-form/create-form.component';
import { EditFormComponent } from './components/edit-form/edit-form.component';
import { FormSubmissionsComponent } from './components/form-submissions/form-submissions.component';
import { FillFormComponent } from './components/fill-form/fill-form.component';
import { FormsList } from './components/forms-list/forms-list';
import { CreateForm } from './components/create-form/create-form';
import { EditForm } from './components/edit-form/edit-form';
import { FillForm } from './components/fill-form/fill-form';
import { FormSubmissions } from './components/form-submissions/form-submissions';

@NgModule({
  declarations: [
    FormsListComponent,
    CreateFormComponent,
    EditFormComponent,
    FormSubmissionsComponent,
    FillFormComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgFormsModule,
    SharedModule,
    FormsRoutingModule
  ],
  providers: [
    FormsService
  ]
})
export class FormsModule { }
