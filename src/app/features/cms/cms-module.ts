import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



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
    CommonModule
  ]
})
export class CmsModule { }


// src/app/features/cms/cms.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { CmsRoutingModule } from './cms-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { CmsService } from './services/cms.service';

// Components
import { CmsOverviewComponent } from './components/cms-overview/cms-overview.component';
import { PagesListComponent } from './components/pages-list/pages-list.component';
import { CreatePageComponent } from './components/create-page/create-page.component';
import { EditPageComponent } from './components/edit-page/edit-page.component';
import { BlogListComponent } from './components/blog-list/blog-list.component';
import { CreateBlogComponent } from './components/create-blog/create-blog.component';
import { EditBlogComponent } from './components/edit-blog/edit-blog.component';
import { CmsOverview } from './components/cms-overview/cms-overview';
import { PagesList } from './components/pages-list/pages-list';
import { CreatePage } from './components/create-page/create-page';
import { EditPage } from './components/edit-page/edit-page';
import { BlogList } from './components/blog-list/blog-list';
import { CreateBlog } from './components/create-blog/create-blog';
import { EditBlog } from './components/edit-blog/edit-blog';

@NgModule({
  declarations: [
    CmsOverviewComponent,
    PagesListComponent,
    CreatePageComponent,
    EditPageComponent,
    BlogListComponent,
    CreateBlogComponent,
    EditBlogComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    CmsRoutingModule
  ],
  providers: [
    CmsService
  ]
})
export class CmsModule { }
