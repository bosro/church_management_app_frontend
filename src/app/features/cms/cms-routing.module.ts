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
import { RoleGuard } from '../../core/guards/role-guard';


const routes: Routes = [
  {
    path: '',
    component: CmsOverview,
    canActivate: [ RoleGuard],
    data: {
      title: 'Content Management',
      breadcrumb: 'CMS',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: 'pages',
    component: PagesList,
    canActivate: [ RoleGuard],
    data: {
      title: 'Pages',
      breadcrumb: 'Pages',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: 'pages/create',
    component: CreatePage,
    canActivate: [ RoleGuard],
    data: {
      title: 'Create Page',
      breadcrumb: 'Create Page',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader']
    }
  },
  {
    path: 'pages/:id/edit',
    component: EditPage,
    canActivate: [ RoleGuard],
    data: {
      title: 'Edit Page',
      breadcrumb: 'Edit',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader']
    }
  },
  {
    path: 'blog',
    component: BlogList,
    canActivate: [ RoleGuard],
    data: {
      title: 'Blog Posts',
      breadcrumb: 'Blog',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: 'blog/create',
    component: CreateBlog,
    canActivate: [ RoleGuard],
    data: {
      title: 'Create Blog Post',
      breadcrumb: 'Create Post',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader']
    }
  },
  {
    path: 'blog/:id/edit',
    component: EditBlog,
    canActivate: [ RoleGuard],
    data: {
      title: 'Edit Blog Post',
      breadcrumb: 'Edit',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader']
    }
  }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CmsRoutingModule { }
