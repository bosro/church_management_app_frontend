// src/app/features/finance/finance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FormsList } from './components/forms-list/forms-list';
import { CreateForm } from './components/create-form/create-form';
import { FormSubmissions } from './components/form-submissions/form-submissions';
import { FillForm } from './components/fill-form/fill-form';
import { EditForm } from './components/edit-form/edit-form';


const routes: Routes = [
  { path: '', component:  FormsList},
  { path: 'create', component:  CreateForm},
  { path: 'form/:id', component: EditForm },
  { path: 'fill-form', component:  FillForm},
  { path: 'form-submission', component:  FormSubmissions},

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FormsRoutingModule { }
