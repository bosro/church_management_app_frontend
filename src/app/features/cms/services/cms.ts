// src/app/features/cms/services/cms.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { CmsPage, BlogPost } from '../../../models/cms.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class CmsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // PAGES CRUD
  getPages(
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ data: CmsPage[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('cms_pages')
          .select(`
            *,
            author:users!created_by(id, full_name, email)
          `, { count: 'exact' })
          .eq('church_id', churchId)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as CmsPage[], count: count || 0 };
      })()
    );
  }

  getPageById(pageId: string): Observable<CmsPage> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('cms_pages')
          .select(`
            *,
            author:users!created_by(id, full_name, email)
          `)
          .eq('id', pageId)
          .single();

        if (error) throw error;

        return data as CmsPage;
      })()
    );
  }

  createPage(pageData: Partial<CmsPage>): Observable<CmsPage> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<CmsPage>('cms_pages', {
        ...pageData,
        church_id: churchId,
        created_by: userId,
        is_published: false,
        slug: this.generateSlug(pageData.title || '')
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updatePage(pageId: string, pageData: Partial<CmsPage>): Observable<CmsPage> {
    const updates = { ...pageData };

    // Update slug if title changed
    if (pageData.title) {
      updates.slug = this.generateSlug(pageData.title);
    }

    return from(
      this.supabase.update<CmsPage>('cms_pages', pageId, updates)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deletePage(pageId: string): Observable<void> {
    return from(
      this.supabase.delete('cms_pages', pageId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  publishPage(pageId: string): Observable<CmsPage> {
    return this.updatePage(pageId, {
      is_published: true,
      published_at: new Date().toISOString()
    });
  }

  unpublishPage(pageId: string): Observable<CmsPage> {
    return this.updatePage(pageId, {
      is_published: false
    });
  }

  // BLOG POSTS CRUD
  getBlogPosts(
    page: number = 1,
    pageSize: number = 20,
    category?: string
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
          .eq('church_id', churchId)
          .order('created_at', { ascending: false });

        if (category) {
          query = query.eq('category', category);
        }

        const { data, error, count } = await query.range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as BlogPost[], count: count || 0 };
      })()
    );
  }

  getBlogPostById(postId: string): Observable<BlogPost> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('blog_posts')
          .select(`
            *,
            author:users!author_id(id, full_name, email, avatar_url)
          `)
          .eq('id', postId)
          .single();

        if (error) throw error;

        return data as BlogPost;
      })()
    );
  }

  createBlogPost(postData: Partial<BlogPost>): Observable<BlogPost> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<BlogPost>('blog_posts', {
        ...postData,
        church_id: churchId,
        author_id: userId,
        is_published: false,
        view_count: 0,
        slug: this.generateSlug(postData.title || '')
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateBlogPost(postId: string, postData: Partial<BlogPost>): Observable<BlogPost> {
    const updates = { ...postData };

    // Update slug if title changed
    if (postData.title) {
      updates.slug = this.generateSlug(postData.title);
    }

    return from(
      this.supabase.update<BlogPost>('blog_posts', postId, updates)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteBlogPost(postId: string): Observable<void> {
    return from(
      this.supabase.delete('blog_posts', postId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  publishBlogPost(postId: string): Observable<BlogPost> {
    return this.updateBlogPost(postId, {
      is_published: true,
      published_at: new Date().toISOString()
    });
  }

  unpublishBlogPost(postId: string): Observable<BlogPost> {
    return this.updateBlogPost(postId, {
      is_published: false
    });
  }

  incrementViewCount(postId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_blog_view_count', {
          post_id: postId
        });

        if (error) throw error;
      })()
    );
  }

  // UTILITY
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // STATISTICS
  getCmsStatistics(): Observable<any> {
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
            .select('is_published, view_count', { count: 'exact' })
            .eq('church_id', churchId)
        ]);

        const totalPages = pagesResult.count || 0;
        const publishedPages = pagesResult.data?.filter(p => p.is_published).length || 0;

        const totalPosts = postsResult.count || 0;
        const publishedPosts = postsResult.data?.filter(p => p.is_published).length || 0;
        const totalViews = postsResult.data?.reduce((sum, p) => sum + (p.view_count || 0), 0) || 0;

        return {
          total_pages: totalPages,
          published_pages: publishedPages,
          draft_pages: totalPages - publishedPages,
          total_posts: totalPosts,
          published_posts: publishedPosts,
          draft_posts: totalPosts - publishedPosts,
          total_views: totalViews
        };
      })()
    );
  }
}
