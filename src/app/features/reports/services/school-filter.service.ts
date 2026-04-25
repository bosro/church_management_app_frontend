import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { currentAcademicYear, generateAcademicYears, TERMS } from '../../../models/school.model';

@Injectable({ providedIn: 'root' })
export class SchoolFilterService {
  private readonly TERM_KEY = 'churchman_selected_term';
  private readonly YEAR_KEY = 'churchman_selected_year';

  private _term = new BehaviorSubject<string>(this._loadTerm());
  private _year = new BehaviorSubject<string>(this._loadYear());

  term$ = this._term.asObservable();
  year$ = this._year.asObservable();

  get term(): string { return this._term.value; }
  get year(): string { return this._year.value; }

  setTerm(term: string): void {
    this._term.next(term);
    localStorage.setItem(this.TERM_KEY, term);
  }

  setYear(year: string): void {
    this._year.next(year);
    localStorage.setItem(this.YEAR_KEY, year);
  }

  setBoth(term: string, year: string): void {
    this.setTerm(term);
    this.setYear(year);
  }

  private _loadTerm(): string {
    return localStorage.getItem(this.TERM_KEY) || TERMS[0];
  }

  private _loadYear(): string {
    const saved = localStorage.getItem(this.YEAR_KEY);
    const validYears = generateAcademicYears();
    // Validate saved year is still in range
    if (saved && validYears.includes(saved)) return saved;
    return currentAcademicYear();
  }
}
