// src/app/features/settings/services/settings.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../core/services/supabase';
import { AuthService } from '../../core/services/auth';
import {
  ChurchSetting,
  Church,
  ChurchUpdateInput,
  SettingCategory,
  NotificationSettings,
  FinanceSettings,
  CommunicationSettings,
  SecuritySettings,
  SettingsState,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_FINANCE_SETTINGS,
  DEFAULT_COMMUNICATION_SETTINGS,
  DEFAULT_SECURITY_SETTINGS
} from '../../models/setting.model';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private churchId?: string;
  private currentUserId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {
    this.churchId = this.authService.getChurchId();
    this.currentUserId = this.authService.getUserId();
  }

  // ==================== CHURCH SETTINGS ====================

  getSettings(category?: SettingCategory): Observable<ChurchSetting[]> {
    return from(this.fetchSettings(category));
  }

  private async fetchSettings(category?: SettingCategory): Promise<ChurchSetting[]> {
    let query = this.supabase.client
      .from('church_settings')
      .select('*')
      .eq('church_id', this.churchId)
      .order('setting_key', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as ChurchSetting[];
  }

  getSetting(key: string): Observable<ChurchSetting | null> {
    return from(
      this.supabase.client
        .from('church_settings')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('setting_key', key)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          throw new Error(error.message);
        }
        return data as ChurchSetting | null;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateSetting(
    key: string,
    value: any,
    category: SettingCategory
  ): Observable<ChurchSetting> {
    return from(this.upsertSetting(key, value, category));
  }

  private async upsertSetting(
    key: string,
    value: any,
    category: SettingCategory
  ): Promise<ChurchSetting> {
    const { data, error } = await this.supabase.client
      .from('church_settings')
      .upsert({
        church_id: this.churchId,
        setting_key: key,
        setting_value: value,
        category: category,
        updated_by: this.currentUserId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'church_id,setting_key'
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as ChurchSetting;
  }

  bulkUpdateSettings(settings: Array<{ key: string; value: any; category: SettingCategory }>): Observable<void> {
    return from(this.bulkUpsertSettings(settings));
  }

  private async bulkUpsertSettings(
    settings: Array<{ key: string; value: any; category: SettingCategory }>
  ): Promise<void> {
    const upserts = settings.map(setting => ({
      church_id: this.churchId,
      setting_key: setting.key,
      setting_value: setting.value,
      category: setting.category,
      updated_by: this.currentUserId,
      updated_at: new Date().toISOString()
    }));

    const { error } = await this.supabase.client
      .from('church_settings')
      .upsert(upserts, {
        onConflict: 'church_id,setting_key'
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  deleteSetting(key: string): Observable<void> {
    return from(
      this.supabase.client
        .from('church_settings')
        .delete()
        .eq('church_id', this.churchId)
        .eq('setting_key', key)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== CHURCH PROFILE ====================

  getChurchProfile(): Observable<Church> {
    return from(
      this.supabase.client
        .from('churches')
        .select('*')
        .eq('id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Church profile not found');
        return data as Church;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateChurchProfile(profileData: ChurchUpdateInput): Observable<Church> {
    return from(
      this.supabase.client
        .from('churches')
        .update({
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Failed to update church profile');
        return data as Church;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== TYPED SETTINGS ====================

  getNotificationSettings(): Observable<NotificationSettings> {
    return this.getSettings('notifications').pipe(
      map(settings => this.mapToNotificationSettings(settings))
    );
  }

  updateNotificationSettings(settings: NotificationSettings): Observable<void> {
    const settingsArray = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      category: 'notifications' as SettingCategory
    }));

    return this.bulkUpdateSettings(settingsArray);
  }

  getFinanceSettings(): Observable<FinanceSettings> {
    return this.getSettings('finance').pipe(
      map(settings => this.mapToFinanceSettings(settings))
    );
  }

  updateFinanceSettings(settings: FinanceSettings): Observable<void> {
    const settingsArray = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      category: 'finance' as SettingCategory
    }));

    return this.bulkUpdateSettings(settingsArray);
  }

  getCommunicationSettings(): Observable<CommunicationSettings> {
    return this.getSettings('communications').pipe(
      map(settings => this.mapToCommunicationSettings(settings))
    );
  }

  updateCommunicationSettings(settings: CommunicationSettings): Observable<void> {
    const settingsArray = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      category: 'communications' as SettingCategory
    }));

    return this.bulkUpdateSettings(settingsArray);
  }

  getSecuritySettings(): Observable<SecuritySettings> {
    return this.getSettings('security').pipe(
      map(settings => this.mapToSecuritySettings(settings))
    );
  }

  updateSecuritySettings(settings: SecuritySettings): Observable<void> {
    const settingsArray = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      category: 'security' as SettingCategory
    }));

    return this.bulkUpdateSettings(settingsArray);
  }

  getAllSettings(): Observable<SettingsState> {
    return forkJoin({
      notifications: this.getNotificationSettings(),
      finance: this.getFinanceSettings(),
      communications: this.getCommunicationSettings(),
      security: this.getSecuritySettings()
    });
  }

  // ==================== MAPPING HELPERS ====================

  private mapToNotificationSettings(settings: ChurchSetting[]): NotificationSettings {
    const result = { ...DEFAULT_NOTIFICATION_SETTINGS };

    settings.forEach(setting => {
      if (setting.setting_key in result) {
        (result as any)[setting.setting_key] = setting.setting_value;
      }
    });

    return result;
  }

  private mapToFinanceSettings(settings: ChurchSetting[]): FinanceSettings {
    const result = { ...DEFAULT_FINANCE_SETTINGS };

    settings.forEach(setting => {
      if (setting.setting_key in result) {
        (result as any)[setting.setting_key] = setting.setting_value;
      }
    });

    return result;
  }

  private mapToCommunicationSettings(settings: ChurchSetting[]): CommunicationSettings {
    const result = { ...DEFAULT_COMMUNICATION_SETTINGS };

    settings.forEach(setting => {
      if (setting.setting_key in result) {
        (result as any)[setting.setting_key] = setting.setting_value;
      }
    });

    return result;
  }

  private mapToSecuritySettings(settings: ChurchSetting[]): SecuritySettings {
    const result = { ...DEFAULT_SECURITY_SETTINGS };

    settings.forEach(setting => {
      if (setting.setting_key in result) {
        (result as any)[setting.setting_key] = setting.setting_value;
      }
    });

    return result;
  }

  // ==================== PERMISSIONS ====================

  canManageSettings(): boolean {
    const adminRoles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(adminRoles);
  }

  canManageFinanceSettings(): boolean {
    const roles = ['super_admin', 'church_admin', 'finance_officer'];
    return this.authService.hasRole(roles);
  }

  canManageSecuritySettings(): boolean {
    const roles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(roles);
  }
}
