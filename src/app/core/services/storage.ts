// src/app/core/services/storage.service.ts
import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(private supabase: SupabaseService) {}

  // Upload file
  uploadFile(
  bucket: string,
  path: string,
  file: File,
  options?: { cacheControl?: string; upsert?: boolean }
): Observable<{ path: string; error: any }> {
  return from(
    this.supabase.client.storage
      .from(bucket)
      .upload(path, file, options)
  ).pipe(
    map(({ data, error }) => ({
      path: data?.path ?? '',
      error
    }))
  );
}


  // Get public URL
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.client.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // Download file
  downloadFile(bucket: string, path: string): Observable<Blob> {
    return from(
      this.supabase.client.storage
        .from(bucket)
        .download(path)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data!;
      })
    );
  }

  // Delete file
  deleteFile(bucket: string, paths: string[]): Observable<any> {
    return from(
      this.supabase.client.storage
        .from(bucket)
        .remove(paths)
    );
  }

  // List files
  listFiles(bucket: string, path?: string): Observable<any[]> {
    return from(
      this.supabase.client.storage
        .from(bucket)
        .list(path)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
    );
  }

  // Upload member photo
  uploadMemberPhoto(churchId: string, memberId: string, file: File): Observable<string> {
    const fileName = `${memberId}-${Date.now()}.${file.name.split('.').pop()}`;
    const path = `${churchId}/${fileName}`;

    return this.uploadFile('member-photos', path, file, {
      cacheControl: '3600',
      upsert: true
    }).pipe(
      map(({ path: uploadedPath, error }) => {
        if (error) throw error;
        return this.getPublicUrl('member-photos', path);
      })
    );
  }

  // Upload church logo
  uploadChurchLogo(churchId: string, file: File): Observable<string> {
    const fileName = `logo.${file.name.split('.').pop()}`;
    const path = `${churchId}/${fileName}`;

    return this.uploadFile('church-media', path, file, {
      cacheControl: '3600',
      upsert: true
    }).pipe(
      map(() => this.getPublicUrl('church-media', path))
    );
  }

  // Upload sermon media
  uploadSermonMedia(churchId: string, sermonId: string, file: File): Observable<string> {
    const fileName = `${sermonId}-${Date.now()}.${file.name.split('.').pop()}`;
    const path = `${churchId}/${fileName}`;

    return this.uploadFile('sermons', path, file, {
      cacheControl: '3600'
    }).pipe(
      map(() => this.getPublicUrl('sermons', path))
    );
  }
}
