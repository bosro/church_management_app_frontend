// src/app/features/cms/cms-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CreatePage } from './components/create-page/create-page';
import { EditPage } from './components/edit-page/edit-page';
import { BlogList } from './components/blog-list/blog-list';
import { CreateBlog } from './components/create-blog/create-blog';
import { EditBlog } from './components/edit-blog/edit-blog';
import { PagesList } from './components/pages-list/pages-list';
import { CmsOverview } from './components/cms-overview/cms-overview';


const routes: Routes = [
  { path: '', component: CmsOverview },
  { path: 'pages', component: PagesList },
  { path: 'pages/create', component: CreatePage },
  { path: 'pages/:id/edit', component: EditPage },
  { path: 'blog', component: BlogList },
  { path: 'blog/create', component: CreateBlog },
  { path: 'blog/:id/edit', component: EditBlog }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CmsRoutingModule { }
