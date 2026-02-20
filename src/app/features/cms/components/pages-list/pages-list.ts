// src/app/features/cms/components/pages-list/pages-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';
import { CmsPage } from '../../../../models/cms.model';

@Component({
  selector: 'app-pages-list',
  standalone: false,
  templateUrl: './pages-list.html',
  styleUrl: './pages-list.scss',
})
export class PagesList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pages: CmsPage[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;
  totalPagesCount = 0;

  // Permissions
  canManageContent = false;
  canPublishContent = false;

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadPages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageContent = this.cmsService.canManageContent();
    this.canPublishContent = this.cmsService.canPublishContent();

    if (!this.cmsService.canViewContent()) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadPages(): void {
    this.loading = true;
    this.errorMessage = '';

    this.cmsService
      .getPages(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.pages = data;
          this.totalPagesCount = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load pages';
          this.loading = false;
          console.error('Error loading pages:', error);
        }
      });
  }

  // Navigation
  createPage(): void {
    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to create pages';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/cms/pages/create']);
  }

  editPage(pageId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to edit pages';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/cms/pages', pageId, 'edit']);
  }

  goBack(): void {
    this.router.navigate(['main/cms']);
  }

  // Actions
  togglePublish(page: CmsPage, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canPublishContent) {
      this.errorMessage = 'You do not have permission to publish/unpublish pages';
      this.scrollToTop();
      return;
    }

    const action = page.is_published ? 'unpublish' : 'publish';
    const observable = page.is_published
      ? this.cmsService.unpublishPage(page.id)
      : this.cmsService.publishPage(page.id);

    observable.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = `Page ${action}ed successfully!`;
        this.loadPages();

        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || `Failed to ${action} page`;
        this.scrollToTop();
        console.error(`${action} error:`, error);
      }
    });
  }

  deletePage(pageId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to delete pages';
      this.scrollToTop();
      return;
    }

    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;

    const confirmMessage = page.is_published
      ? `This page is currently published. Are you sure you want to delete "${page.title}"?`
      : `Are you sure you want to delete "${page.title}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.cmsService
      .deletePage(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Page deleted successfully!';
          this.loadPages();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete page';
          this.scrollToTop();
          console.error('Delete error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPages();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPages();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
