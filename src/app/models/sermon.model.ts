// src/app/models/sermon.model.ts
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
  duration?: number; // in minutes
  view_count: number;
  download_count: number;
  is_featured: boolean;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;

  // Relations (populated by joins)
  author?: {
    id: string;
    full_name: string;
    email?: string;
  };
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SermonFormData {
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
  tags?: string[];
}

export interface SermonStatistics {
  total_sermons: number;
  total_series: number;
  featured_sermons: number;
  total_views: number;
  total_downloads: number;
  recent_sermons_count: number;
  most_viewed_sermon?: {
    id: string;
    title: string;
    view_count: number;
  };
  most_downloaded_sermon?: {
    id: string;
    title: string;
    download_count: number;
  };
}

export interface SermonSeriesFormData {
  name: string;
  description?: string;
  thumbnail_url?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

// Common tags for sermons
export const COMMON_SERMON_TAGS = [
  'Faith',
  'Prayer',
  'Worship',
  'Grace',
  'Love',
  'Hope',
  'Salvation',
  'Discipleship',
  'Holy Spirit',
  'Bible Study',
  'Evangelism',
  'Church',
  'Family',
  'Marriage',
  'Youth',
  'Leadership',
  'Service',
  'Giving',
  'Stewardship',
  'Prophecy'
] as const;

export type SermonTag = typeof COMMON_SERMON_TAGS[number];
