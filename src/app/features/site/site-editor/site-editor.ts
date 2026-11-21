import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

@Component({ selector: 'app-site-editor', standalone: false, templateUrl: './site-editor.html' })
export class SiteEditor implements OnInit {
  loading = true; saving = false; churchId = ''; uploading = ''; allowed = true; msg = ''; err = '';
  slug = ''; published = false; churchName = '';
  c: any = { services: [], leaders: [], announcements: [], values: [], stats: [], color: '#4f46e5' };
  base = location.origin;
  constructor(private supabase: SupabaseService) { }

  async ngOnInit() {
    const { data, error } = await this.supabase.client.rpc('get_my_site');
    this.loading = false;
    if (error || !data) { this.err = error?.message || 'Could not load'; return; }
    this.churchId = data.church_id; this.allowed = data.allowed; this.slug = data.slug; this.published = data.published; this.churchName = data.church_name;
    this.c = { services: [], leaders: [], announcements: [], values: [], stats: [], color: '#4f46e5', ...(data.content || {}) };
    // older saved sites used `about`; show it in the new About box
    if (!this.c.community_text && this.c.about) this.c.community_text = this.c.about;
  }
  add(list: 'services' | 'leaders' | 'announcements' | 'values' | 'stats') {
    if (!this.c[list]) this.c[list] = [];
    const blank: any = {
      services: { name: '', day: 'Sunday', time: '', image: '' },
      leaders: { name: '', role: '', photo: '' },
      announcements: { title: '', date: new Date().toISOString().slice(0, 10), text: '', image: '' },
      values: '',
      stats: { value: '', label: '', text: '' },
    };
    this.c[list].push(blank[list]);
  }
  trackIdx(i: number) { return i; }
  remove(list: string, i: number) { this.c[list].splice(i, 1); }

  /** Upload a photo to the church-media bucket and put its URL into `obj[key]` */
  async upload(ev: Event, obj: any, key: string) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { this.err = 'Image is larger than 5 MB.'; return; }
    this.uploading = key; this.err = '';
    const path = `${this.churchId}/site/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await this.supabase.client.storage.from('church-media').upload(path, f, { upsert: true, cacheControl: '3600' });
    this.uploading = '';
    if (error) { this.err = 'Upload failed: ' + error.message; return; }
    obj[key] = this.supabase.client.storage.from('church-media').getPublicUrl(path).data.publicUrl;
  }

  async save() {
    this.saving = true; this.msg = ''; this.err = '';
    const { data, error } = await this.supabase.client.rpc('save_my_site', { p_slug: this.slug, p_content: this.c, p_published: this.published });
    this.saving = false;
    if (error || !data?.success) { this.err = error?.message || data?.error || 'Could not save'; return; }
    this.slug = data.slug; this.msg = this.published ? 'Saved — your website is live.' : 'Saved as draft (not public yet).';
  }
}