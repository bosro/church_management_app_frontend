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

  // Relations
  author?: any;
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

  // Relations
  author?: any;
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
];
