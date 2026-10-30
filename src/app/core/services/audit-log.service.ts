// src/app/core/services/audit-log.service.ts
// Super admin: read the audit trail (who changed what, when). Goes through admin_audit_logs (secrets are masked server-side).
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export interface AuditFilters {
  from?: string;        // 'YYYY-MM-DD' (local day, inclusive)
  to?: string;          // 'YYYY-MM-DD' (local day, inclusive)
  churchId?: string;
  table?: string;
  action?: string;      // INSERT | UPDATE | DELETE
  userSearch?: string;
}

export interface AuditRow {
  id: string;
  created_at: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string | null;
  church_id: string | null;
  church_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  /** UPDATE: { field: { from, to } } */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  /** INSERT / DELETE: the row */
  data: Record<string, unknown> | null;
}

export interface AuditPage { total: number; rows: AuditRow[] }

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

  private startOfDay(d: string): string | null {
    return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(`${d}T00:00:00`).toISOString() : null;
  }

  /** end is exclusive: midnight AFTER the chosen day */
  private endOfDay(d: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null;
    const x = new Date(`${d}T00:00:00`);
    x.setDate(x.getDate() + 1);
    return x.toISOString();
  }

  async getPage(f: AuditFilters, limit: number, offset: number): Promise<AuditPage> {
    const { data, error } = await this.supabase.client.rpc('admin_audit_logs', {
      p_from: f.from ? this.startOfDay(f.from) : null,
      p_to: f.to ? this.endOfDay(f.to) : null,
      p_church: f.churchId || null,
      p_table: f.table || null,
      p_action: f.action || null,
      p_user_search: f.userSearch?.trim() || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    return data as AuditPage;
  }

  async getTables(): Promise<string[]> {
    const { data, error } = await this.supabase.client.rpc('admin_audit_tables');
    if (error) throw new Error(error.message);
    return (data || []) as string[];
  }

  async getChurches(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.supabase.client.from('churches').select('id, name').order('name');
    if (error) throw new Error(error.message);
    return (data || []).map((c: any) => ({ id: c.id, name: (c.name || '').trim() }));
  }
}
