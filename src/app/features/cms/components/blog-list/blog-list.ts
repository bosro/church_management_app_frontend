// src/app/features/cms/components/blog-list/blog-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';
import { BlogPost, BLOG_CATEGORIES } from '../../../../models/cms.model';

@Component({
  selector: 'app-blog-list',
  standalone: false,
  templateUrl: './blog-list.html',
  styleUrl: './blog-list.scss',
})
export class BlogList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  blogPosts: BlogPost[] = [];
  categories = BLOG_CATEGORIES;
  selectedCategory: string = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 12;
  totalPages = 0;
  totalPosts = 0;

  // Permissions
  canManageContent = false;
  canPublishContent = false;

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadBlogPosts();
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

  loadBlogPosts(): void {
    this.loading = true;
    this.errorMessage = '';

    const filters = this.selectedCategory
      ? { category: this.selectedCategory }
      : undefined;

    this.cmsService
      .getBlogPosts(this.currentPage, this.pageSize, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.blogPosts = data;
          this.totalPosts = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load blog posts';
          this.loading = false;
          console.error('Error loading blog posts:', error);
        }
      });
  }

  // Filtering
  filterByCategory(category: string): void {
    this.selectedCategory = category;
    this.currentPage = 1;
    this.loadBlogPosts();
  }

  clearFilter(): void {
    this.selectedCategory = '';
    this.currentPage = 1;
    this.loadBlogPosts();
  }

  // Navigation
  createBlogPost(): void {
    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to create blog posts';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/cms/blog/create']);
  }

  editBlogPost(postId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to edit blog posts';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/cms/blog', postId, 'edit']);
  }

  goBack(): void {
    this.router.navigate(['main/cms']);
  }

  // Actions
  togglePublish(post: BlogPost, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canPublishContent) {
      this.errorMessage = 'You do not have permission to publish/unpublish blog posts';
      this.scrollToTop();
      return;
    }

    const action = post.is_published ? 'unpublish' : 'publish';
    const observable = post.is_published
      ? this.cmsService.unpublishBlogPost(post.id)
      : this.cmsService.publishBlogPost(post.id);

    observable.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = `Blog post ${action}ed successfully!`;
        this.loadBlogPosts();

        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || `Failed to ${action} blog post`;
        this.scrollToTop();
        console.error(`${action} error:`, error);
      }
    });
  }

  deleteBlogPost(postId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageContent) {
      this.errorMessage = 'You do not have permission to delete blog posts';
      this.scrollToTop();
      return;
    }

    const post = this.blogPosts.find(p => p.id === postId);
    if (!post) return;

    const confirmMessage = post.is_published
      ? `This blog post is currently published and has ${post.view_count} views. Are you sure you want to delete "${post.title}"?`
      : `Are you sure you want to delete "${post.title}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.cmsService
      .deleteBlogPost(postId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Blog post deleted successfully!';
          this.loadBlogPosts();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete blog post';
          this.scrollToTop();
          console.error('Delete error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBlogPosts();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBlogPosts();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
