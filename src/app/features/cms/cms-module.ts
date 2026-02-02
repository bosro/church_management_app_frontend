import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CmsRoutingModule } from './cms-routing.module';
import { SharedModule } from '../../shared/shared-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CmsOverview } from './components/cms-overview/cms-overview';
import { CreatePage } from './components/create-page/create-page';
import { PagesList } from './components/pages-list/pages-list';
import { EditPage } from './components/edit-page/edit-page';
import { BlogList } from './components/blog-list/blog-list';
import { EditBlog } from './components/edit-blog/edit-blog';
import { CreateBlog } from './components/create-blog/create-blog';



@NgModule({
  declarations: [
    CmsOverview,
    PagesList,
    CreatePage,
    EditPage,
    BlogList,
    CreateBlog,
    EditBlog
  ],
  imports: [
    CommonModule,
     ReactiveFormsModule,
    FormsModule,
    SharedModule,
    CmsRoutingModule
  ]
})
export class CmsModule { }


