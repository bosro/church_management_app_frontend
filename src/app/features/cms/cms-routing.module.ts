// src/app/features/cms/cms-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CmsOverviewComponent } from './components/cms-overview/cms-overview.component';
import { PagesListComponent } from './components/pages-list/pages-list.component';
import { CreatePageComponent } from './components/create-page/create-page.component';
import { EditPageComponent } from './components/edit-page/edit-page.component';
import { BlogListComponent } from './components/blog-list/blog-list.component';
import { CreateBlogComponent } from './components/create-blog/create-blog.component';
import { EditBlogComponent } from './components/edit-blog/edit-blog.component';

const routes: Routes = [
  { path: '', component: CmsOverviewComponent },
  { path: 'pages', component: PagesListComponent },
  { path: 'pages/create', component: CreatePageComponent },
  { path: 'pages/:id/edit', component: EditPageComponent },
  { path: 'blog', component: BlogListComponent },
  { path: 'blog/create', component: CreateBlogComponent },
  { path: 'blog/:id/edit', component: EditBlogComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CmsRoutingModule { }
