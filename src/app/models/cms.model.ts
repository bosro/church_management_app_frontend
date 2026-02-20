// src/app/models/cms.model.ts
export interface CmsPage {
  id: string;
  church_id: string;
  title: string;
  slug: string;
  content: string;
  is_published: boolean;
  published_at?: string;
  meta_description?: string;
  meta_keywords?: string;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Relations (populated by joins)
  author?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface BlogPost {
  id: string;
  church_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  author_id: string;
  category?: string;
  tags?: string[];
  is_published: boolean;
  published_at?: string;
  view_count: number;
  created_at: string;
  updated_at: string;

  // Relations (populated by joins)
  author?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface CmsStatistics {
  total_pages: number;
  published_pages: number;
  draft_pages: number;
  total_posts: number;
  published_posts: number;
  draft_posts: number;
  total_views: number;
  most_viewed_post?: {
    title: string;
    view_count: number;
  };
  recent_activity_count: number;
}

export interface PageFormData {
  title: string;
  content: string;
  meta_description?: string;
  meta_keywords?: string;
}

export interface BlogPostFormData {
  title: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  category?: string;
  tags?: string[];
}

export const BLOG_CATEGORIES = [
  'Sermons',
  'Devotional',
  'Events',
  'Announcements',
  'Testimonies',
  'Ministry Updates',
  'Community',
  'Prayer',
  'Bible Study',
  'Youth',
  'Children',
  'Missions'
] as const;

export type BlogCategory = typeof BLOG_CATEGORIES[number];
