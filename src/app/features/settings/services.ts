import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Services {

}
// src/app/features/settings/services/settings.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

export interface ChurchSetting {
  id: string;
  church_id: string;
  setting_key: string;
  setting_value: any;
  category: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  getSettings(category?: string): Observable<ChurchSetting[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('church_settings')
          .select('*')
          .eq('church_id', churchId)
          .order('setting_key', { ascending: true });

        if (category) {
          query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) throw error;

        return data as ChurchSetting[];
      })()
    );
  }

  getSetting(key: string): Observable<ChurchSetting | null> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('church_settings')
          .select('*')
          .eq('church_id', churchId)
          .eq('setting_key', key)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        return data as ChurchSetting | null;
      })()
    );
  }

  updateSetting(key: string, value: any, category: string): Observable<ChurchSetting> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('church_settings')
          .upsert({
            church_id: churchId,
            setting_key: key,
            setting_value: value,
            category: category,
            updated_by: userId
          })
          .select()
          .single();

        if (error) throw error;

        return data as ChurchSetting;
      })()
    );
  }

  // Church Profile
  updateChurchProfile(profileData: any): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.update('churches', churchId, profileData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  getChurchProfile(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.query('churches', {
        filters: { id: churchId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data[0];
      })
    );
  }
}
