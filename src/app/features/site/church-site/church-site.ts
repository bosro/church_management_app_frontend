import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-church-site',
  standalone: false,
  templateUrl: './church-site.html',
})
export class ChurchSite implements OnInit {
  loading = true;
  notFound = false;
  site: any = null;
  c: any = {};
  constructor(private route: ActivatedRoute, private supabase: SupabaseService) {}

  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    const { data } = await this.supabase.client.rpc('get_public_site', { p_slug: slug });
    this.loading = false;
    if (!data) { this.notFound = true; return; }
    this.site = data;
    this.c = data.content || {};
    document.title = `${data.church_name}${this.c.tagline ? ' – ' + this.c.tagline : ''}`;
  }
  get color(): string { return this.site?.color || this.c.color || '#4f46e5'; }
  get giveUrl(): string { return this.c.give_url || ('/public/give/' + this.site.church_id); }
  regUrl(id: string): string { return '/public/event-register/' + id; }
  mapUrl(): string { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.c.address || ''); }
  wa(): string { return 'https://wa.me/' + String(this.c.phone || '').replace(/\D/g, ''); }
}