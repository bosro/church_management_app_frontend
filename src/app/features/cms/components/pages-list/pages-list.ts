// src/app/features/cms/components/pages-list/pages-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsPage } from '../../../../models/cms.model';
import { CmsService } from '../../services/cms';

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

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPages(): void {
    this.loading = true;

    this.cmsService.getPages(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.pages = data;
          this.totalPagesCount = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading pages:', error);
          this.loading = false;
        }
      });
  }

  // Navigation
  createPage(): void {
    this.router.navigate(['/cms/pages/create']);
  }

  editPage(pageId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/cms/pages', pageId, 'edit']);
  }

  goBack(): void {
    this.router.navigate(['/cms']);
  }

  // Actions
  togglePublish(page: CmsPage, event: Event): void {
    event.stopPropagation();

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
      }
    });
  }

  deletePage(pageId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this page?')) {
      this.cmsService.deletePage(pageId)
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
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPages();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPages();
    }
  }
}
