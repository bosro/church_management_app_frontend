// src/app/features/cms/cms-routing.module.ts
// KEY FIX: Replaced RoleGuard → PermissionGuard on all routes.
// Added senior_pastor, associate_pastor to all routes.
// Role list kept narrow (admin/pastor) since CMS is content management.
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { CreatePage } from './components/create-page/create-page';
import { EditPage } from './components/edit-page/edit-page';
import { BlogList } from './components/blog-list/blog-list';
import { CreateBlog } from './components/create-blog/create-blog';
import { EditBlog } from './components/edit-blog/edit-blog';
import { PagesList } from './components/pages-list/pages-list';
import { CmsOverview } from './components/cms-overview/cms-overview';

const CMS_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'secretary',
];

const CMS_MANAGE_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader',
];

const routes: Routes = [
  {
    path: '',
    component: CmsOverview,
    canActivate: [PermissionGuard],
    data: {
      title: 'Content Management',
      breadcrumb: 'CMS',
      roles: CMS_VIEW_ROLES,
    },
  },
  {
    path: 'pages',
    component: PagesList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Pages',
      breadcrumb: 'Pages',
      roles: CMS_VIEW_ROLES,
    },
  },
  // IMPORTANT: 'pages/create' must come before 'pages/:id'
  {
    path: 'pages/create',
    component: CreatePage,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Page',
      breadcrumb: 'Create Page',
      roles: CMS_MANAGE_ROLES,
    },
  },
  {
    path: 'pages/:id/edit',
    component: EditPage,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Page',
      breadcrumb: 'Edit',
      roles: CMS_MANAGE_ROLES,
    },
  },
  {
    path: 'blog',
    component: BlogList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Blog Posts',
      breadcrumb: 'Blog',
      roles: CMS_VIEW_ROLES,
    },
  },
  // IMPORTANT: 'blog/create' must come before 'blog/:id'
  {
    path: 'blog/create',
    component: CreateBlog,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Blog Post',
      breadcrumb: 'Create Post',
      roles: CMS_MANAGE_ROLES,
    },
  },
  {
    path: 'blog/:id/edit',
    component: EditBlog,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Blog Post',
      breadcrumb: 'Edit',
      roles: CMS_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CmsRoutingModule {}
