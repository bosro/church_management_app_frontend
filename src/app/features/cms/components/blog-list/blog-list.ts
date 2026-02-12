
// src/app/features/cms/components/blog-list/blog-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BlogPost, BLOG_CATEGORIES } from '../../../../models/cms.model';
import { CmsService } from '../../services/cms';

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
  pageSize = 20;
  totalPosts = 0;
  totalPages = 0;

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadBlogPosts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBlogPosts(): void {
    this.loading = true;

    this.cmsService.getBlogPosts(this.currentPage, this.pageSize, this.selectedCategory || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.blogPosts = data;
          this.totalPosts = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading blog posts:', error);
          this.loading = false;
        }
      });
  }

  // Navigation
  createBlogPost(): void {
    this.router.navigate(['main/cms/blog/create']);
  }

  editBlogPost(postId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/cms/blog', postId, 'edit']);
  }

  goBack(): void {
    this.router.navigate(['main/cms']);
  }

  // Filters
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

  // Actions
  togglePublish(post: BlogPost, event: Event): void {
    event.stopPropagation();

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
      }
    });
  }

  deleteBlogPost(postId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this blog post?')) {
      this.cmsService.deleteBlogPost(postId)
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
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadBlogPosts();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadBlogPosts();
    }
  }
}
