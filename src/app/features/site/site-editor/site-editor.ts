import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

@Component({ selector: 'app-site-editor', standalone: false, templateUrl: './site-editor.html' })
export class SiteEditor implements OnInit {
  loading = true; saving = false; churchId = ''; uploading = ''; allowed = true; msg = ''; err = '';
  slug = ''; published = false; churchName = '';
  c: any = { services: [], leaders: [], announcements: [], color: '#4f46e5' };
  base = location.origin;
  constructor(private supabase: SupabaseService) { }

  async ngOnInit() {
    const { data, error } = await this.supabase.client.rpc('get_my_site');
    this.loading = false;
    if (error || !data) { this.err = error?.message || 'Could not load'; return; }
    this.churchId = data.church_id; this.allowed = data.allowed; this.slug = data.slug; this.published = data.published; this.churchName = data.church_name;
    this.c = { services: [], leaders: [], announcements: [], color: '#4f46e5', ...(data.content || {}) };
  }
  add(list: 'services' | 'leaders' | 'announcements') {
    this.c[list].push(list === 'services' ? { name: '', day: 'Sunday', time: '', image: '' } : list === 'leaders' ? { name: '', role: '', photo: '' } : { title: '', date: new Date().toISOString().slice(0, 10), text: '', image: '' });
  }
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