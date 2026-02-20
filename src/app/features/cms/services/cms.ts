// src/app/features/cms/services/cms.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  CmsPage,
  BlogPost,
  CmsStatistics,
  PageFormData,
  BlogPostFormData,
  BLOG_CATEGORIES
} from '../../../models/cms.model';

@Injectable({
  providedIn: 'root'
})
export class CmsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // ==================== PERMISSIONS ====================

  canManageContent(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canPublishContent(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor'];
    return this.authService.hasRole(roles);
  }

  canViewContent(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'];
    return this.authService.hasRole(roles);
  }

  // ==================== PAGES CRUD ====================

  getPages(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      isPublished?: boolean;
      searchTerm?: string;
    }
  ): Observable<{ data: CmsPage[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('cms_pages')
          .select(`
            *,
            author:users!created_by(id, full_name, email, avatar_url)
          `, { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.isPublished !== undefined) {
          query = query.eq('is_published', filters.isPublished);
        }
        if (filters?.searchTerm) {
          query = query.or(`title.ilike.%${filters.searchTerm}%,content.ilike.%${filters.searchTerm}%`);
        }

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as CmsPage[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading pages:', err);
        return throwError(() => err);
      })
    );
  }

  getPageById(pageId: string): Observable<CmsPage> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('cms_pages')
        .select(`
          *,
          author:users!created_by(id, full_name, email, avatar_url)
        `)
        .eq('id', pageId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Page not found');
        return data as CmsPage;
      }),
      catchError(err => {
        console.error('Error loading page:', err);
        return throwError(() => err);
      })
    );
  }

  createPage(pageData: PageFormData): Observable<CmsPage> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    // Validate required fields
    if (!pageData.title || pageData.title.trim().length < 3) {
      return throwError(() => new Error('Page title must be at least 3 characters'));
    }

    if (!pageData.content || pageData.content.trim().length < 10) {
      return throwError(() => new Error('Page content must be at least 10 characters'));
    }

    // Validate meta description length
    if (pageData.meta_description && pageData.meta_description.length > 160) {
      return throwError(() => new Error('Meta description should not exceed 160 characters'));
    }

    const slug = this.generateSlug(pageData.title);

    return from(
      (async () => {
        // Check for slug uniqueness
        const { data: existing } = await this.supabase.client
          .from('cms_pages')
          .select('id')
          .eq('church_id', churchId)
          .eq('slug', slug)
          .maybeSingle();

        if (existing) {
          throw new Error('A page with this title already exists. Please use a different title.');
        }

        return this.supabase.insert<CmsPage>('cms_pages', {
          church_id: churchId,
          created_by: userId,
          title: pageData.title.trim(),
          content: pageData.content.trim(),
          slug: slug,
          meta_description: pageData.meta_description?.trim() || null,
          meta_keywords: pageData.meta_keywords?.trim() || null,
          is_published: false
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create page');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating page:', err);
        return throwError(() => err);
      })
    );
  }

  updatePage(pageId: string, pageData: Partial<PageFormData>): Observable<CmsPage> {
    const churchId = this.authService.getChurchId();

    // Validate title if provided
    if (pageData.title !== undefined && pageData.title.trim().length < 3) {
      return throwError(() => new Error('Page title must be at least 3 characters'));
    }

    // Validate content if provided
    if (pageData.content !== undefined && pageData.content.trim().length < 10) {
      return throwError(() => new Error('Page content must be at least 10 characters'));
    }

    // Validate meta description length
    if (pageData.meta_description && pageData.meta_description.length > 160) {
      return throwError(() => new Error('Meta description should not exceed 160 characters'));
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('cms_pages')
          .select('id, slug')
          .eq('id', pageId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Page not found or access denied');
        }

        const updateData: any = {
          ...pageData,
          title: pageData.title?.trim(),
          content: pageData.content?.trim(),
          meta_description: pageData.meta_description?.trim() || null,
          meta_keywords: pageData.meta_keywords?.trim() || null,
          updated_at: new Date().toISOString()
        };

        // Update slug if title changed
        if (pageData.title) {
          const newSlug = this.generateSlug(pageData.title);

          // Check if new slug conflicts with another page
          if (newSlug !== existing.slug) {
            const { data: conflict } = await this.supabase.client
              .from('cms_pages')
              .select('id')
              .eq('church_id', churchId)
              .eq('slug', newSlug)
              .neq('id', pageId)
              .maybeSingle();

            if (conflict) {
              throw new Error('A page with this title already exists. Please use a different title.');
            }

            updateData.slug = newSlug;
          }
        }

        return this.supabase.update<CmsPage>('cms_pages', pageId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update page');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating page:', err);
        return throwError(() => err);
      })
    );
  }

  deletePage(pageId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('cms_pages')
          .select('id, title')
          .eq('id', pageId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Page not found or access denied');
        }

        return this.supabase.delete('cms_pages', pageId);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting page:', err);
        return throwError(() => err);
      })
    );
  }

  publishPage(pageId: string): Observable<CmsPage> {
    return this.updatePage(pageId, {
      is_published: true,
      published_at: new Date().toISOString()
    } as any);
  }

  unpublishPage(pageId: string): Observable<CmsPage> {
    return this.updatePage(pageId, {
      is_published: false
    } as any);
  }

  // ==================== BLOG POSTS CRUD ====================

  getBlogPosts(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      category?: string;
      isPublished?: boolean;
      searchTerm?: string;
    }
  ): Observable<{ data: BlogPost[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('blog_posts')
          .select(`
            *,
            author:users!author_id(id, full_name, email, avatar_url)
          `, { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.category) {
          query = query.eq('category', filters.category);
        }
        if (filters?.isPublished !== undefined) {
          query = query.eq('is_published', filters.isPublished);
        }
        if (filters?.searchTerm) {
          query = query.or(`title.ilike.%${filters.searchTerm}%,content.ilike.%${filters.searchTerm}%,excerpt.ilike.%${filters.searchTerm}%`);
        }

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as BlogPost[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading blog posts:', err);
        return throwError(() => err);
      })
    );
  }

  getBlogPostById(postId: string): Observable<BlogPost> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('blog_posts')
        .select(`
          *,
          author:users!author_id(id, full_name, email, avatar_url)
        `)
        .eq('id', postId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Blog post not found');
        return data as BlogPost;
      }),
      catchError(err => {
        console.error('Error loading blog post:', err);
        return throwError(() => err);
      })
    );
  }

  createBlogPost(postData: BlogPostFormData): Observable<BlogPost> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    // Validate required fields
    if (!postData.title || postData.title.trim().length < 3) {
      return throwError(() => new Error('Blog title must be at least 3 characters'));
    }

    if (!postData.content || postData.content.trim().length < 10) {
      return throwError(() => new Error('Blog content must be at least 10 characters'));
    }

    // Validate category if provided
    if (postData.category && !BLOG_CATEGORIES.includes(postData.category as any)) {
      return throwError(() => new Error('Invalid blog category'));
    }

    // Validate excerpt length
    if (postData.excerpt && postData.excerpt.length > 300) {
      return throwError(() => new Error('Excerpt should not exceed 300 characters'));
    }

    // Validate image URL if provided
    if (postData.featured_image_url && !this.isValidUrl(postData.featured_image_url)) {
      return throwError(() => new Error('Invalid image URL'));
    }

    const slug = this.generateSlug(postData.title);

    return from(
      (async () => {
        // Check for slug uniqueness
        const { data: existing } = await this.supabase.client
          .from('blog_posts')
          .select('id')
          .eq('church_id', churchId)
          .eq('slug', slug)
          .maybeSingle();

        if (existing) {
          throw new Error('A blog post with this title already exists. Please use a different title.');
        }

        return this.supabase.insert<BlogPost>('blog_posts', {
          church_id: churchId,
          author_id: userId,
          title: postData.title.trim(),
          content: postData.content.trim(),
          excerpt: postData.excerpt?.trim() || null,
          featured_image_url: postData.featured_image_url?.trim() || null,
          category: postData.category || null,
          tags: postData.tags || [],
          slug: slug,
          is_published: false,
          view_count: 0
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create blog post');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating blog post:', err);
        return throwError(() => err);
      })
    );
  }

  updateBlogPost(postId: string, postData: Partial<BlogPostFormData>): Observable<BlogPost> {
    const churchId = this.authService.getChurchId();

    // Validate title if provided
    if (postData.title !== undefined && postData.title.trim().length < 3) {
      return throwError(() => new Error('Blog title must be at least 3 characters'));
    }

    // Validate content if provided
    if (postData.content !== undefined && postData.content.trim().length < 10) {
      return throwError(() => new Error('Blog content must be at least 10 characters'));
    }

    // Validate category if provided
    if (postData.category && !BLOG_CATEGORIES.includes(postData.category as any)) {
      return throwError(() => new Error('Invalid blog category'));
    }

    // Validate excerpt length
    if (postData.excerpt && postData.excerpt.length > 300) {
      return throwError(() => new Error('Excerpt should not exceed 300 characters'));
    }

    // Validate image URL if provided
    if (postData.featured_image_url && !this.isValidUrl(postData.featured_image_url)) {
      return throwError(() => new Error('Invalid image URL'));
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('blog_posts')
          .select('id, slug')
          .eq('id', postId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Blog post not found or access denied');
        }

        const updateData: any = {
          ...postData,
          title: postData.title?.trim(),
          content: postData.content?.trim(),
          excerpt: postData.excerpt?.trim() || null,
          featured_image_url: postData.featured_image_url?.trim() || null,
          updated_at: new Date().toISOString()
        };

        // Update slug if title changed
        if (postData.title) {
          const newSlug = this.generateSlug(postData.title);

          // Check if new slug conflicts with another post
          if (newSlug !== existing.slug) {
            const { data: conflict } = await this.supabase.client
              .from('blog_posts')
              .select('id')
              .eq('church_id', churchId)
              .eq('slug', newSlug)
              .neq('id', postId)
              .maybeSingle();

            if (conflict) {
              throw new Error('A blog post with this title already exists. Please use a different title.');
            }

            updateData.slug = newSlug;
          }
        }

        return this.supabase.update<BlogPost>('blog_posts', postId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update blog post');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating blog post:', err);
        return throwError(() => err);
      })
    );
  }

  deleteBlogPost(postId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('blog_posts')
          .select('id, title')
          .eq('id', postId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Blog post not found or access denied');
        }

        return this.supabase.delete('blog_posts', postId);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting blog post:', err);
        return throwError(() => err);
      })
    );
  }

  publishBlogPost(postId: string): Observable<BlogPost> {
    return this.updateBlogPost(postId, {
      is_published: true,
      published_at: new Date().toISOString()
    } as any);
  }

  unpublishBlogPost(postId: string): Observable<BlogPost> {
    return this.updateBlogPost(postId, {
      is_published: false
    } as any);
  }

  incrementViewCount(postId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_blog_view_count', {
          post_id: postId
        });

        if (error) throw new Error(error.message);
      })()
    ).pipe(
      catchError(err => {
        console.error('Error incrementing view count:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== STATISTICS ====================

  getCmsStatistics(): Observable<CmsStatistics> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const [pagesResult, postsResult] = await Promise.all([
          this.supabase.client
            .from('cms_pages')
            .select('is_published', { count: 'exact' })
            .eq('church_id', churchId),
          this.supabase.client
            .from('blog_posts')
            .select('is_published, view_count, title', { count: 'exact' })
            .eq('church_id', churchId)
        ]);

        const totalPages = pagesResult.count || 0;
        const publishedPages = pagesResult.data?.filter(p => p.is_published).length || 0;

        const totalPosts = postsResult.count || 0;
        const publishedPosts = postsResult.data?.filter(p => p.is_published).length || 0;
        const totalViews = postsResult.data?.reduce((sum, p) => sum + (p.view_count || 0), 0) || 0;

        // Find most viewed post
        const sortedPosts = [...(postsResult.data || [])].sort((a, b) =>
          (b.view_count || 0) - (a.view_count || 0)
        );
        const mostViewedPost = sortedPosts.length > 0 ? {
          title: sortedPosts[0].title,
          view_count: sortedPosts[0].view_count || 0
        } : undefined;

        // Count recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { count: recentActivity } = await this.supabase.client
          .from('blog_posts')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .gte('created_at', sevenDaysAgo.toISOString());

        return {
          total_pages: totalPages,
          published_pages: publishedPages,
          draft_pages: totalPages - publishedPages,
          total_posts: totalPosts,
          published_posts: publishedPosts,
          draft_posts: totalPosts - publishedPosts,
          total_views: totalViews,
          most_viewed_post: mostViewedPost,
          recent_activity_count: recentActivity || 0
        };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== UTILITY METHODS ====================

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  searchPages(searchTerm: string): Observable<CmsPage[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('cms_pages')
        .select('*')
        .eq('church_id', churchId)
        .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`)
        .order('created_at', { ascending: false })
        .limit(10)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as CmsPage[];
      }),
      catchError(err => {
        console.error('Search error:', err);
        return throwError(() => err);
      })
    );
  }

  searchBlogPosts(searchTerm: string, category?: string): Observable<BlogPost[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('blog_posts')
          .select('*')
          .eq('church_id', churchId)
          .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,excerpt.ilike.%${searchTerm}%`);

        if (category) {
          query = query.eq('category', category);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw new Error(error.message);
        return data as BlogPost[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Search error:', err);
        return throwError(() => err);
      })
    );
  }

  getPublishedPages(): Observable<CmsPage[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('cms_pages')
        .select('id, title, slug, meta_description')
        .eq('church_id', churchId)
        .eq('is_published', true)
        .order('title', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as CmsPage[];
      }),
      catchError(err => {
        console.error('Error loading published pages:', err);
        return throwError(() => err);
      })
    );
  }

  getBlogCategories(): Observable<string[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('blog_posts')
        .select('category')
        .eq('church_id', churchId)
        .not('category', 'is', null)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        const categories = [...new Set(data?.map(p => p.category).filter(Boolean))];
        return categories as string[];
      }),
      catchError(err => {
        console.error('Error loading categories:', err);
        return throwError(() => err);
      })
    );
  }
}
