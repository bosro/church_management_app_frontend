import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

interface Slide { kind: string; title: string; sub?: string; text?: string; img?: string; link?: string; linkLabel?: string; }

@Component({
  selector: 'app-church-site',
  standalone: false,
  templateUrl: './church-site.html',
  styleUrls: ['./church-site.scss'],
  encapsulation: ViewEncapsulation.None, // the page is styled by .cs rules so each church's brand colour (--c) applies everywhere
})
export class ChurchSite implements OnInit, OnDestroy {
  loading = true;
  notFound = false;
  site: any = null;
  c: any = {};
  slides: Slide[] = [];
  dot = 0;
  menuOpen = false;

  constructor(private route: ActivatedRoute, private supabase: SupabaseService, private titleSvc: Title, private meta: Meta) { }

  async ngOnInit() {
    this.addFonts();
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    const { data } = await this.supabase.client.rpc('get_public_site', { p_slug: slug });
    this.loading = false;
    if (!data) { this.notFound = true; return; }
    this.site = data;
    this.c = data.content || {};
    this.applySeo();
    this.buildSlides();
  }

  ngOnDestroy() {
    document.getElementById('cs-jsonld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
    ['description', 'og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']
      .forEach((n) => { this.meta.removeTag(`name="${n}"`); this.meta.removeTag(`property="${n}"`); });
  }

  /** Search-engine + share-preview tags, built from this church's own content (church can override in the editor) */
  private applySeo() {
    const c = this.c, name = this.site.church_name;
    const place = (c.address || '').split(',').slice(-2).join(',').trim();
    const title = (c.seo_title || `${name}${c.tagline ? ' – ' + c.tagline : place ? ' – Church in ' + place : ' – Church'}`).slice(0, 70);
    const clean = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const desc = clean(c.seo_description || c.community_text || c.about || c.mission || c.tagline ||
      `Welcome to ${name}. Find our service times, events and how to get in touch.`).slice(0, 158);
    const img = c.seo_image || c.hero_image || c.community_image || this.site.logo_url || '';
    const url = `${location.origin}/${this.site.slug}`;

    this.titleSvc.setTitle(title);
    this.meta.updateTag({ name: 'description', content: desc });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: name });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ name: 'twitter:card', content: img ? 'summary_large_image' : 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
    if (img) { this.meta.updateTag({ property: 'og:image', content: img }); this.meta.updateTag({ name: 'twitter:image', content: img }); }

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;

    // Structured data so Google can show the church with address, phone and links
    const ld: any = {
      '@context': 'https://schema.org', '@type': 'Church', name, url, description: desc,
      ...(img && { image: img }), ...(c.phone && { telephone: c.phone }), ...(c.email && { email: c.email }),
      ...(c.address && { address: { '@type': 'PostalAddress', streetAddress: c.address } }),
      sameAs: [c.facebook, c.instagram, c.youtube].filter(Boolean),
    };
    let s = document.getElementById('cs-jsonld') as HTMLScriptElement | null;
    if (!s) { s = document.createElement('script'); s.id = 'cs-jsonld'; s.type = 'application/ld+json'; document.head.appendChild(s); }
    s.text = JSON.stringify(ld);
  }

  private addFonts() {
    if (document.getElementById('cs-fonts')) return;
    const l = document.createElement('link');
    l.id = 'cs-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Oswald:wght@500;600&display=swap';
    document.head.appendChild(l);
  }

  /** Upcoming events (from the app, live) followed by the church's own announcements */
  private buildSlides() {
    const ev: Slide[] = (this.site.events || []).map((e: any) => ({
      kind: 'EVENT', title: e.title,
      sub: [e.start_date ? new Date(e.start_date).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '', e.location].filter(Boolean).join(' · '),
      img: e.banner_url, link: e.registration_required ? this.regUrl(e.id) : '', linkLabel: 'Register',
    }));
    const news: Slide[] = (this.c.announcements || []).map((a: any) => ({
      kind: 'NEWS', title: a.title, sub: a.date, text: a.text, img: a.image,
    }));
    this.slides = [...ev, ...news];
  }

  get color(): string { return this.site?.color || this.c.color || '#4f46e5'; }
  get giveUrl(): string { return this.c.give_url || ('/public/give/' + this.site.church_id); }
  get heroCtaUrl(): string { return this.c.hero_cta_url || this.giveUrl; }
  get heroCtaLabel(): string { return this.c.hero_cta_label || 'Give online'; }
  get nextService(): any { return this.c.services?.[0] || null; }
  get values(): string[] { return (this.c.values || []).filter((v: string) => v && v.trim()); }
  get stats(): any[] { return (this.c.stats || []).filter((s: any) => s && s.value); }
  regUrl(id: string): string { return '/public/event-register/' + id; }
  mapUrl(): string { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.c.address || ''); }
  wa(): string { return 'https://wa.me/' + String(this.c.phone || '').replace(/\D/g, ''); }

  /** Smooth-scroll to a section (plain #links would send the browser back to the app root / sign-in) */
  go(id: string) { this.menuOpen = false; document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  scrollTrack(dir: number) {
    document.getElementById('cs-track')?.scrollBy({ left: dir * 400, behavior: 'smooth' });
  }
  onTrackScroll(ev: Event) {
    const t = ev.target as HTMLElement;
    const max = t.scrollWidth - t.clientWidth;
    this.dot = max > 0 ? Math.round((t.scrollLeft / max) * (Math.min(this.slides.length, 6) - 1)) : 0;
  }
  get dots(): number[] { return Array.from({ length: Math.min(this.slides.length, 6) }, (_, i) => i); }
  trackIdx(i: number) { return i; }
}