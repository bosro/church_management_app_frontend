// src/app/features/sermons/services/sermons.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  Sermon,
  SermonSeries,
  SermonFormData,
  SermonStatistics,
  SermonSeriesFormData
} from '../../../models/sermon.model';

/**
 * SermonsService
 *
 * Manages sermon library including:
 * - CRUD operations for sermons
 * - Sermon series management
 * - View and download tracking
 * - Featured sermons
 * - Statistics and analytics
 *
 * Security: Uses RLS policies with is_admin() and get_user_church_id()
 */

@Injectable({
  providedIn: 'root'
})
export class SermonsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // ==================== PERMISSIONS ====================

  canManageSermons(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'media_team'];
    return this.authService.hasRole(roles);
  }

  canViewSermons(): boolean {
    // All authenticated users can view sermons
    return true;
  }

  canManageSeries(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor'];
    return this.authService.hasRole(roles);
  }

  // ==================== SERMONS CRUD ====================

  /**
   * Get sermons with pagination and optional series filter
   * RLS automatically filters by church_id
   */
  getSermons(
    page: number = 1,
    pageSize: number = 20,
    series?: string
  ): Observable<{ data: Sermon[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('sermons')
          .select(`
            *,
            author:users!created_by(id, full_name, email)
          `, { count: 'exact' })
          .eq('church_id', churchId)
          .order('sermon_date', { ascending: false });

        if (series) {
          query = query.eq('series_name', series);
        }

        const { data, error, count } = await query
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Sermon[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading sermons:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get a single sermon by ID
   * RLS automatically verifies church ownership
   */
  getSermonById(sermonId: string): Observable<Sermon> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('sermons')
        .select(`
          *,
          author:users!created_by(id, full_name, email)
        `)
        .eq('id', sermonId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Sermon not found');
        return data as Sermon;
      }),
      catchError(err => {
        console.error('Error loading sermon:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Create a new sermon
   * RLS verifies user is admin via is_admin()
   */
  createSermon(sermonData: SermonFormData): Observable<Sermon> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    // Validate required fields
    if (!sermonData.title || sermonData.title.trim().length < 3) {
      return throwError(() => new Error('Sermon title must be at least 3 characters'));
    }

    if (!sermonData.preacher_name || sermonData.preacher_name.trim().length < 2) {
      return throwError(() => new Error('Preacher name must be at least 2 characters'));
    }

    if (!sermonData.sermon_date) {
      return throwError(() => new Error('Sermon date is required'));
    }

    // Validate date format
    if (!this.isValidDateFormat(sermonData.sermon_date)) {
      return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'));
    }

    // Validate URLs if provided
    if (sermonData.audio_url && !this.isValidUrl(sermonData.audio_url)) {
      return throwError(() => new Error('Invalid audio URL'));
    }

    if (sermonData.video_url && !this.isValidUrl(sermonData.video_url)) {
      return throwError(() => new Error('Invalid video URL'));
    }

    if (sermonData.notes_url && !this.isValidUrl(sermonData.notes_url)) {
      return throwError(() => new Error('Invalid notes URL'));
    }

    if (sermonData.thumbnail_url && !this.isValidUrl(sermonData.thumbnail_url)) {
      return throwError(() => new Error('Invalid thumbnail URL'));
    }

    // Validate duration if provided
    if (sermonData.duration !== undefined && sermonData.duration !== null) {
      if (sermonData.duration < 0 || sermonData.duration > 600) {
        return throwError(() => new Error('Duration must be between 0 and 600 minutes'));
      }
    }

    return from(
      (async () => {
        // Check for duplicate sermon title on same date
        const { data: existing } = await this.supabase.client
          .from('sermons')
          .select('id')
          .eq('church_id', churchId)
          .eq('sermon_date', sermonData.sermon_date)
          .ilike('title', sermonData.title.trim())
          .maybeSingle();

        if (existing) {
          throw new Error('A sermon with this title already exists on this date');
        }

        return this.supabase.insert<Sermon>('sermons', {
          church_id: churchId,
          created_by: userId,
          title: sermonData.title.trim(),
          description: sermonData.description?.trim() || null,
          preacher_name: sermonData.preacher_name.trim(),
          sermon_date: sermonData.sermon_date,
          series_name: sermonData.series_name?.trim() || null,
          scripture_reference: sermonData.scripture_reference?.trim() || null,
          audio_url: sermonData.audio_url?.trim() || null,
          video_url: sermonData.video_url?.trim() || null,
          notes_url: sermonData.notes_url?.trim() || null,
          thumbnail_url: sermonData.thumbnail_url?.trim() || null,
          duration: sermonData.duration || null,
          tags: sermonData.tags || [],
          view_count: 0,
          download_count: 0,
          is_featured: false
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to create sermon');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating sermon:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Update an existing sermon
   * RLS verifies user is admin and sermon belongs to their church
   */
  updateSermon(sermonId: string, sermonData: Partial<SermonFormData>): Observable<Sermon> {
    const churchId = this.authService.getChurchId();

    // Validate title if provided
    if (sermonData.title !== undefined && sermonData.title.trim().length < 3) {
      return throwError(() => new Error('Sermon title must be at least 3 characters'));
    }

    // Validate preacher name if provided
    if (sermonData.preacher_name !== undefined && sermonData.preacher_name.trim().length < 2) {
      return throwError(() => new Error('Preacher name must be at least 2 characters'));
    }

    // Validate date format if provided
    if (sermonData.sermon_date && !this.isValidDateFormat(sermonData.sermon_date)) {
      return throwError(() => new Error('Invalid date format. Use YYYY-MM-DD'));
    }

    // Validate URLs if provided
    if (sermonData.audio_url && !this.isValidUrl(sermonData.audio_url)) {
      return throwError(() => new Error('Invalid audio URL'));
    }

    if (sermonData.video_url && !this.isValidUrl(sermonData.video_url)) {
      return throwError(() => new Error('Invalid video URL'));
    }

    if (sermonData.notes_url && !this.isValidUrl(sermonData.notes_url)) {
      return throwError(() => new Error('Invalid notes URL'));
    }

    if (sermonData.thumbnail_url && !this.isValidUrl(sermonData.thumbnail_url)) {
      return throwError(() => new Error('Invalid thumbnail URL'));
    }

    // Validate duration if provided
    if (sermonData.duration !== undefined && sermonData.duration !== null) {
      if (sermonData.duration < 0 || sermonData.duration > 600) {
        return throwError(() => new Error('Duration must be between 0 and 600 minutes'));
      }
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('sermons')
          .select('id, title, sermon_date')
          .eq('id', sermonId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Sermon not found or access denied');
        }

        // Check for duplicate title if title or date is being changed
        if (sermonData.title || sermonData.sermon_date) {
          const checkTitle = sermonData.title?.trim() || existing.title;
          const checkDate = sermonData.sermon_date || existing.sermon_date;

          if (checkTitle !== existing.title || checkDate !== existing.sermon_date) {
            const { data: duplicate } = await this.supabase.client
              .from('sermons')
              .select('id')
              .eq('church_id', churchId)
              .eq('sermon_date', checkDate)
              .ilike('title', checkTitle)
              .neq('id', sermonId)
              .maybeSingle();

            if (duplicate) {
              throw new Error('A sermon with this title already exists on this date');
            }
          }
        }

        const updateData: any = {
          ...sermonData,
          title: sermonData.title?.trim(),
          description: sermonData.description?.trim() || null,
          preacher_name: sermonData.preacher_name?.trim(),
          series_name: sermonData.series_name?.trim() || null,
          scripture_reference: sermonData.scripture_reference?.trim() || null,
          audio_url: sermonData.audio_url?.trim() || null,
          video_url: sermonData.video_url?.trim() || null,
          notes_url: sermonData.notes_url?.trim() || null,
          thumbnail_url: sermonData.thumbnail_url?.trim() || null,
          updated_at: new Date().toISOString()
        };

        return this.supabase.update<Sermon>('sermons', sermonId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update sermon');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating sermon:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Delete a sermon
   * RLS verifies user is admin and sermon belongs to their church
   */
  deleteSermon(sermonId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('sermons')
          .select('id, title')
          .eq('id', sermonId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Sermon not found or access denied');
        }

        return this.supabase.delete('sermons', sermonId);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(err => {
        console.error('Error deleting sermon:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Toggle featured status
   */
  toggleFeatured(sermonId: string, isFeatured: boolean): Observable<Sermon> {
    return this.updateSermon(sermonId, { is_featured: isFeatured } as any);
  }

  /**
   * Increment view count
   * Uses database function for atomic increment
   */
  incrementViewCount(sermonId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_sermon_view_count', {
          sermon_id: sermonId
        });

        if (error) {
          console.error('Error incrementing view count:', error);
          // Don't throw - this is a non-critical operation
        }
      })()
    ).pipe(
      catchError(err => {
        console.error('Error incrementing view count:', err);
        // Return empty observable - don't fail the main operation
        return of(void 0);
      })
    );
  }

  /**
   * Increment download count
   * Uses database function for atomic increment
   */
  incrementDownloadCount(sermonId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_sermon_download_count', {
          sermon_id: sermonId
        });

        if (error) {
          console.error('Error incrementing download count:', error);
          // Don't throw - this is a non-critical operation
        }
      })()
    ).pipe(
      catchError(err => {
        console.error('Error incrementing download count:', err);
        // Return empty observable - don't fail the main operation
        return of(void 0);
      })
    );
  }

  // ==================== SERMON SERIES ====================

  /**
   * Get all sermon series
   * RLS automatically filters by church_id
   */
  getSermonSeries(): Observable<SermonSeries[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('sermon_series')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SermonSeries[];
      }),
      catchError(err => {
        console.error('Error loading sermon series:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get a single sermon series by ID
   */
  getSermonSeriesById(seriesId: string): Observable<SermonSeries> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('sermon_series')
        .select('*')
        .eq('id', seriesId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Sermon series not found');
        return data as SermonSeries;
      }),
      catchError(err => {
        console.error('Error loading sermon series:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Create a new sermon series
   * RLS verifies user is admin
   */
  createSermonSeries(seriesData: SermonSeriesFormData): Observable<SermonSeries> {
    const churchId = this.authService.getChurchId();

    // Validate required fields
    if (!seriesData.name || seriesData.name.trim().length < 2) {
      return throwError(() => new Error('Series name must be at least 2 characters'));
    }

    // Validate dates if provided
    if (seriesData.start_date && !this.isValidDateFormat(seriesData.start_date)) {
      return throwError(() => new Error('Invalid start date format'));
    }

    if (seriesData.end_date && !this.isValidDateFormat(seriesData.end_date)) {
      return throwError(() => new Error('Invalid end date format'));
    }

    if (seriesData.start_date && seriesData.end_date) {
      if (new Date(seriesData.end_date) < new Date(seriesData.start_date)) {
        return throwError(() => new Error('End date cannot be before start date'));
      }
    }

    // Validate thumbnail URL if provided
    if (seriesData.thumbnail_url && !this.isValidUrl(seriesData.thumbnail_url)) {
      return throwError(() => new Error('Invalid thumbnail URL'));
    }

    return from(
      (async () => {
        // Check for duplicate series name
        const { data: existing } = await this.supabase.client
          .from('sermon_series')
          .select('id')
          .eq('church_id', churchId)
          .ilike('name', seriesData.name.trim())
          .maybeSingle();

        if (existing) {
          throw new Error('A series with this name already exists');
        }

        return this.supabase.insert<SermonSeries>('sermon_series', {
          church_id: churchId,
          name: seriesData.name.trim(),
          description: seriesData.description?.trim() || null,
          thumbnail_url: seriesData.thumbnail_url?.trim() || null,
          start_date: seriesData.start_date || null,
          end_date: seriesData.end_date || null,
          is_active: seriesData.is_active !== undefined ? seriesData.is_active : true,
          sermon_count: 0
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to create series');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating sermon series:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Update a sermon series
   * RLS verifies user is admin and series belongs to their church
   */
  updateSermonSeries(seriesId: string, seriesData: Partial<SermonSeriesFormData>): Observable<SermonSeries> {
    const churchId = this.authService.getChurchId();

    // Validate name if provided
    if (seriesData.name !== undefined && seriesData.name.trim().length < 2) {
      return throwError(() => new Error('Series name must be at least 2 characters'));
    }

    // Validate dates if provided
    if (seriesData.start_date && !this.isValidDateFormat(seriesData.start_date)) {
      return throwError(() => new Error('Invalid start date format'));
    }

    if (seriesData.end_date && !this.isValidDateFormat(seriesData.end_date)) {
      return throwError(() => new Error('Invalid end date format'));
    }

    if (seriesData.start_date && seriesData.end_date) {
      if (new Date(seriesData.end_date) < new Date(seriesData.start_date)) {
        return throwError(() => new Error('End date cannot be before start date'));
      }
    }

    // Validate thumbnail URL if provided
    if (seriesData.thumbnail_url && !this.isValidUrl(seriesData.thumbnail_url)) {
      return throwError(() => new Error('Invalid thumbnail URL'));
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('sermon_series')
          .select('id, name')
          .eq('id', seriesId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Series not found or access denied');
        }

        // Check for duplicate name if name is being changed
        if (seriesData.name && seriesData.name.trim() !== existing.name) {
          const { data: duplicate } = await this.supabase.client
            .from('sermon_series')
            .select('id')
            .eq('church_id', churchId)
            .ilike('name', seriesData.name.trim())
            .neq('id', seriesId)
            .maybeSingle();

          if (duplicate) {
            throw new Error('A series with this name already exists');
          }
        }

        const updateData: any = {
          ...seriesData,
          name: seriesData.name?.trim(),
          description: seriesData.description?.trim() || null,
          thumbnail_url: seriesData.thumbnail_url?.trim() || null,
          updated_at: new Date().toISOString()
        };

        return this.supabase.update<SermonSeries>('sermon_series', seriesId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update series');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating sermon series:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Delete a sermon series (soft delete)
   * RLS verifies user is admin and series belongs to their church
   */
  deleteSermonSeries(seriesId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership and check sermon count
        const { data: existing } = await this.supabase.client
          .from('sermon_series')
          .select('id, name, sermon_count')
          .eq('id', seriesId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Series not found or access denied');
        }

        if (existing.sermon_count && existing.sermon_count > 0) {
          throw new Error('Cannot delete series with sermons. Please remove sermons from this series first.');
        }

        // Soft delete
        return this.supabase.update<SermonSeries>('sermon_series', seriesId, {
          is_active: false,
          updated_at: new Date().toISOString()
        } as any);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(err => {
        console.error('Error deleting sermon series:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== STATISTICS ====================

  /**
   * Get sermon statistics for the current church
   * RLS automatically filters by church_id
   */
  getSermonStatistics(): Observable<SermonStatistics> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Get sermon stats
        const { data: sermonsData } = await this.supabase.client
          .from('sermons')
          .select('id, title, view_count, download_count, is_featured, created_at')
          .eq('church_id', churchId);

        // Get series count
        const { count: seriesCount } = await this.supabase.client
          .from('sermon_series')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('is_active', true);

        const totalSermons = sermonsData?.length || 0;
        const totalViews = sermonsData?.reduce((sum, s) => sum + (s.view_count || 0), 0) || 0;
        const totalDownloads = sermonsData?.reduce((sum, s) => sum + (s.download_count || 0), 0) || 0;
        const featuredSermons = sermonsData?.filter(s => s.is_featured).length || 0;

        // Get most viewed sermon
        const mostViewed = sermonsData
          ?.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];

        const mostViewedSermon = mostViewed ? {
          id: mostViewed.id,
          title: mostViewed.title,
          view_count: mostViewed.view_count || 0
        } : undefined;

        // Get most downloaded sermon
        const mostDownloaded = sermonsData
          ?.sort((a, b) => (b.download_count || 0) - (a.download_count || 0))[0];

        const mostDownloadedSermon = mostDownloaded ? {
          id: mostDownloaded.id,
          title: mostDownloaded.title,
          download_count: mostDownloaded.download_count || 0
        } : undefined;

        // Count recent sermons (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentSermonsCount = sermonsData?.filter(
          s => new Date(s.created_at) >= thirtyDaysAgo
        ).length || 0;

        return {
          total_sermons: totalSermons,
          total_series: seriesCount || 0,
          featured_sermons: featuredSermons,
          total_views: totalViews,
          total_downloads: totalDownloads,
          recent_sermons_count: recentSermonsCount,
          most_viewed_sermon: mostViewedSermon,
          most_downloaded_sermon: mostDownloadedSermon
        };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== SEARCH & FILTER ====================

  /**
   * Search sermons by title, preacher, or scripture
   */
  searchSermons(searchTerm: string, filters?: {
    series?: string;
    featured?: boolean;
    startDate?: string;
    endDate?: string;
  }): Observable<Sermon[]> {
    const churchId = this.authService.getChurchId();

    if (!searchTerm || searchTerm.trim().length < 2) {
      return throwError(() => new Error('Search term must be at least 2 characters'));
    }

    return from(
      (async () => {
        let query = this.supabase.client
          .from('sermons')
          .select('*')
          .eq('church_id', churchId)
          .or(`title.ilike.%${searchTerm}%,preacher_name.ilike.%${searchTerm}%,scripture_reference.ilike.%${searchTerm}%`);

        if (filters?.series) {
          query = query.eq('series_name', filters.series);
        }

        if (filters?.featured !== undefined) {
          query = query.eq('is_featured', filters.featured);
        }

        if (filters?.startDate) {
          query = query.gte('sermon_date', filters.startDate);
        }

        if (filters?.endDate) {
          query = query.lte('sermon_date', filters.endDate);
        }

        const { data, error } = await query
          .order('sermon_date', { ascending: false })
          .limit(50);

        if (error) throw error;
        return data as Sermon[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Search error:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get featured sermons
   */
  getFeaturedSermons(limit: number = 10): Observable<Sermon[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('sermons')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_featured', true)
        .order('sermon_date', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Sermon[];
      }),
      catchError(err => {
        console.error('Error loading featured sermons:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get recent sermons
   */
  getRecentSermons(limit: number = 10): Observable<Sermon[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('sermons')
        .select('*')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Sermon[];
      }),
      catchError(err => {
        console.error('Error loading recent sermons:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== HELPER METHODS ====================

  private isValidDateFormat(date: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;

    const parsedDate = new Date(date);
    return parsedDate instanceof Date && !isNaN(parsedDate.getTime());
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format duration for display
   */
  formatDuration(minutes?: number): string {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  /**
   * Process video URL for embedding
   */
  processVideoUrl(url: string): string {
    if (!url) return '';

    // Convert YouTube watch URLs to embed URLs
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }

    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}`;
    }

    if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
      return `https://player.vimeo.com/video/${videoId}`;
    }

    return url;
  }
}
