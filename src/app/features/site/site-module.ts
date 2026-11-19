import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../core/guards/auth-guard';
import { SiteEditor } from './site-editor/site-editor';
import { ChurchSite } from './church-site/church-site';

const routes: Routes = [
  { path: 'website-builder', component: SiteEditor, canActivate: [AuthGuard] },
  { path: ':slug', component: ChurchSite },
];

@NgModule({
  declarations: [ChurchSite, SiteEditor],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes)],
})
export class SiteModule {}