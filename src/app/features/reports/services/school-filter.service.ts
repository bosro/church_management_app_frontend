import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { currentAcademicYear, generateAcademicYears, TERMS } from '../../../models/school.model';

@Injectable({ providedIn: 'root' })
export class SchoolFilterService {
  private readonly TERM_KEY = 'churchman_selected_term';
  private readonly YEAR_KEY = 'churchman_selected_year';
  private readonly CONFIRMED_KEY = 'churchman_filter_confirmed';

  private _term = new BehaviorSubject<string>(this._loadTerm());
  private _year = new BehaviorSubject<string>(this._loadYear());

  term$ = this._term.asObservable();
  year$ = this._year.asObservable();

  get term(): string { return this._term.value; }
  get year(): string { return this._year.value; }
  get isConfirmed(): boolean {
    return localStorage.getItem(this.CONFIRMED_KEY) === 'true';
  }

  setTerm(term: string): void {
    this._term.next(term);
    localStorage.setItem(this.TERM_KEY, term);
    localStorage.setItem(this.CONFIRMED_KEY, 'true'); // mark as explicitly set
  }

  setYear(year: string): void {
    this._year.next(year);
    localStorage.setItem(this.YEAR_KEY, year);
    localStorage.setItem(this.CONFIRMED_KEY, 'true'); // mark as explicitly set
  }

  setBoth(term: string, year: string): void {
    this._term.next(term);
    this._year.next(year);
    localStorage.setItem(this.TERM_KEY, term);
    localStorage.setItem(this.YEAR_KEY, year);
    localStorage.setItem(this.CONFIRMED_KEY, 'true'); // mark as explicitly set
  }

  private _loadTerm(): string {
    const saved = localStorage.getItem(this.TERM_KEY);
    if (saved) return saved;
    const defaultTerm = TERMS[0];
    localStorage.setItem(this.TERM_KEY, defaultTerm); // persist default
    return defaultTerm;
  }

  private _loadYear(): string {
    const saved = localStorage.getItem(this.YEAR_KEY);
    const validYears = generateAcademicYears();
    if (saved && validYears.includes(saved)) return saved;
    const defaultYear = currentAcademicYear();
    localStorage.setItem(this.YEAR_KEY, defaultYear); // persist default
    return defaultYear;
  }
}
