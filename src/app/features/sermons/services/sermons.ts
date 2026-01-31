import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Sermons {

}
// src/app/features/sermons/services/sermons.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

export interface Sermon {
  id: string;
  church_id: string;
  title: string;
  description?: string;
  preacher_name: string;
  sermon_date: string;
  series_name?: string;
  scripture_reference?: string;
  audio_url?: string;
  video_url?: string;
  notes_url?: string;
  thumbnail_url?: string;
  duration?: number;
  view_count: number;
  download_count: number;
  is_featured: boolean;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;

  // Relations
  author?: any;
}

export interface SermonSeries {
  id: string;
  church_id: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  start_date?: string;
  end_date?: string;
  sermon_count: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SermonsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // SERMONS CRUD
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

        const { data, error, count } = await query.range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Sermon[], count: count || 0 };
      })()
    );
  }

  getSermonById(sermonId: string): Observable<Sermon> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('sermons')
          .select(`
            *,
            author:users!created_by(id, full_name, email)
          `)
          .eq('id', sermonId)
          .single();

        if (error) throw error;

        return data as Sermon;
      })()
    );
  }

  createSermon(sermonData: Partial<Sermon>): Observable<Sermon> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<Sermon>('sermons', {
        ...sermonData,
        church_id: churchId,
        created_by: userId,
        view_count: 0,
        download_count: 0,
        is_featured: false
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateSermon(sermonId: string, sermonData: Partial<Sermon>): Observable<Sermon> {
    return from(
      this.supabase.update<Sermon>('sermons', sermonId, sermonData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteSermon(sermonId: string): Observable<void> {
    return from(
      this.supabase.delete('sermons', sermonId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  toggleFeatured(sermonId: string, isFeatured: boolean): Observable<Sermon> {
    return this.updateSermon(sermonId, { is_featured: isFeatured });
  }

  incrementViewCount(sermonId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_sermon_view_count', {
          sermon_id: sermonId
        });

        if (error) throw error;
      })()
    );
  }

  incrementDownloadCount(sermonId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.rpc('increment_sermon_download_count', {
          sermon_id: sermonId
        });

        if (error) throw error;
      })()
    );
  }

  // SERMON SERIES
  getSermonSeries(): Observable<SermonSeries[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('sermon_series')
          .select('*')
          .eq('church_id', churchId)
          .order('start_date', { ascending: false });

        if (error) throw error;

        return data as SermonSeries[];
      })()
    );
  }

  createSermonSeries(seriesData: Partial<SermonSeries>): Observable<SermonSeries> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<SermonSeries>('sermon_series', {
        ...seriesData,
        church_id: churchId,
        sermon_count: 0
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateSermonSeries(seriesId: string, seriesData: Partial<SermonSeries>): Observable<SermonSeries> {
    return from(
      this.supabase.update<SermonSeries>('sermon_series', seriesId, seriesData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteSermonSeries(seriesId: string): Observable<void> {
    return from(
      this.supabase.delete('sermon_series', seriesId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // STATISTICS
  getSermonStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const [sermonsResult, seriesResult] = await Promise.all([
          this.supabase.client
            .from('sermons')
            .select('view_count, download_count, is_featured', { count: 'exact' })
            .eq('church_id', churchId),
          this.supabase.client
            .from('sermon_series')
            .select('id', { count: 'exact' })
            .eq('church_id', churchId)
        ]);

        const totalSermons = sermonsResult.count || 0;
        const totalViews = sermonsResult.data?.reduce((sum, s) => sum + (s.view_count || 0), 0) || 0;
        const totalDownloads = sermonsResult.data?.reduce((sum, s) => sum + (s.download_count || 0), 0) || 0;
        const featuredSermons = sermonsResult.data?.filter(s => s.is_featured).length || 0;
        const totalSeries = seriesResult.count || 0;

        return {
          total_sermons: totalSermons,
          total_series: totalSeries,
          featured_sermons: featuredSermons,
          total_views: totalViews,
          total_downloads: totalDownloads
        };
      })()
    );
  }
}
