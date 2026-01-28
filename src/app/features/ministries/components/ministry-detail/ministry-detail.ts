
// src/app/features/ministries/components/ministry-detail/ministry-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { MemberService } from '../../../members/services/member.service';
import { Ministry } from '../../../../models/ministry.model';

@Component({
  selector: 'app-ministry-detail',
  standalone: false,
  templateUrl: './ministry-detail.html',
  styleUrl: './ministry-detail.scss',
})
export class MinistryDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministryId: string = '';
  ministry: Ministry | null = null;
  members: any[] = [];
  leaders: any[] = [];
  loading = true;
  errorMessage = '';
  successMessage = '';

  // Active tab
  activeTab: 'members' | 'leaders' = 'members';

  // Add Member
  showAddMember = false;
  searchControl = new FormControl('');
  searchResults: any[] = [];
  searching = false;
  addingMember = false;

  // Add Leader
  showAddLeader = false;
  selectedMemberForLeader: any = null;
  leaderPosition = '';
  leaderStartDate = new Date().toISOString().split('T')[0];
  leaderEndDate = '';
  addingLeader = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ministryService: MinistryService,
    private memberService: MemberService
  ) {}

  ngOnInit(): void {
    this.ministryId = this.route.snapshot.paramMap.get('id') || '';
    if (this.ministryId) {
      this.loadMinistryDetails();
      this.setupMemberSearch();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMinistryDetails(): void {
    this.loading = true;

    // Load ministry
    this.ministryService.getMinistryById(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.ministry = ministry;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load ministry';
          this.loading = false;
        }
      });

    // Load members
    this.loadMembers();

    // Load leaders
    this.loadLeaders();
  }

  private loadMembers(): void {
    this.ministryService.getMinistryMembers(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (members) => {
          this.members = members;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading members:', error);
          this.loading = false;
        }
      });
  }

  private loadLeaders(): void {
    this.ministryService.getMinistryLeaders(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (leaders) => {
          this.leaders = leaders;
        },
        error: (error) => {
          console.error('Error loading leaders:', error);
        }
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.ministryService.searchAvailableMembers(this.ministryId, query);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
        }
      });
  }

  // Tab switching
  switchTab(tab: 'members' | 'leaders'): void {
    this.activeTab = tab;
  }

  // Add Member
  toggleAddMember(): void {
    this.showAddMember = !this.showAddMember;
    if (!this.showAddMember) {
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  addMemberToMinistry(member: any): void {
    this.addingMember = true;

    this.ministryService.addMemberToMinistry(this.ministryId, member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Member added successfully!';
          this.loadMembers();
          this.toggleAddMember();
          this.addingMember = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to add member';
          this.addingMember = false;
        }
      });
  }

  removeMember(membershipId: string): void {
    if (confirm('Are you sure you want to remove this member from the ministry?')) {
      this.ministryService.removeMemberFromMinistry(membershipId, this.ministryId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Member removed successfully!';
            this.loadMembers();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to remove member';
          }
        });
    }
  }

  // Add Leader
  toggleAddLeader(): void {
    this.showAddLeader = !this.showAddLeader;
    if (!this.showAddLeader) {
      this.selectedMemberForLeader = null;
      this.leaderPosition = '';
      this.leaderStartDate = new Date().toISOString().split('T')[0];
      this.leaderEndDate = '';
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  selectMemberForLeader(member: any): void {
    this.selectedMemberForLeader = member;
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  addLeader(): void {
    if (!this.selectedMemberForLeader || !this.leaderPosition || !this.leaderStartDate) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.addingLeader = true;

    this.ministryService.addMinistryLeader(
      this.ministryId,
      this.selectedMemberForLeader.id,
      this.leaderPosition,
      this.leaderStartDate,
      this.leaderEndDate || undefined
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Leader added successfully!';
          this.loadLeaders();
          this.toggleAddLeader();
          this.addingLeader = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to add leader';
          this.addingLeader = false;
        }
      });
  }

  removeLeader(leadershipId: string): void {
    if (confirm('Are you sure you want to remove this leader?')) {
      this.ministryService.removeMinistryLeader(leadershipId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Leader removed successfully!';
            this.loadLeaders();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to remove leader';
          }
        });
    }
  }

  // Export
  exportMinistryReport(): void {
    this.ministryService.exportMinistryReport(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.ministry?.name}_members.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/ministries']);
  }

  editMinistry(): void {
    this.router.navigate(['/ministries', this.ministryId, 'edit']);
  }

  deleteMinistry(): void {
    if (confirm('Are you sure you want to delete this ministry?')) {
      this.ministryService.deleteMinistry(this.ministryId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.router.navigate(['/ministries']);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete ministry';
          }
        });
    }
  }

  // Helper methods
  getMemberName(member: any): string {
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: any): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }
}
