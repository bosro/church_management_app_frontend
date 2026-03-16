import { Component, OnInit } from '@angular/core';
import { Church } from '../../../models/church.model';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-churches',
  standalone: false,
  templateUrl: './churches.html',
  styleUrl: './churches.scss',
})

export class Churches implements OnInit {
  churches: Church[] = [];
  filteredChurches: Church[] = [];
  loading = false;
  searchTerm = '';

  showCreateModal = false;
  showEditModal = false;
  selectedChurch: Church | null = null;

  churchForm = {
    name: '',
    location: '',
    size_category: '',
    contact_email: '',
    contact_phone: '',
    enabled_features: [] as string[],
  };

  errorMessage = '';
  successMessage = '';
  processing = false;

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadChurches();
  }

  loadChurches(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getAllChurches().subscribe({
      next: (data) => {
        this.churches = data;
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load churches';
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    this.filteredChurches = this.churches.filter((church) => {
      const matchesSearch =
        !this.searchTerm ||
        church.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        church.location?.toLowerCase().includes(this.searchTerm.toLowerCase());

      return matchesSearch;
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  openCreateModal(): void {
    this.churchForm = {
      name: '',
      location: '',
      size_category: '',
      contact_email: '',
      contact_phone: '',
      enabled_features: [] as string[],
    };
    this.showCreateModal = true;
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  openEditModal(church: Church): void {
    this.selectedChurch = church;
    this.churchForm = {
      name: church.name,
      location: church.location || '',
      size_category: church.size_category || '',
      contact_email: church.contact_email || '',
      contact_phone: church.contact_phone || '',
      enabled_features: church.enabled_features || [],
    };
    this.showEditModal = true;
    this.errorMessage = '';
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedChurch = null;
  }

  createChurch(): void {
    this.processing = true;
    this.errorMessage = '';

    this.adminService
      .createChurch({
        ...this.churchForm,
        is_active: true,
      })
      .subscribe({
        next: () => {
          this.successMessage = 'Church created successfully!';
          this.processing = false;
          this.closeCreateModal();
          this.loadChurches();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create church';
          this.processing = false;
        },
      });
  }

  updateChurch(): void {
    if (!this.selectedChurch) return;

    this.processing = true;
    this.errorMessage = '';

    this.adminService
      .updateChurch(this.selectedChurch.id, this.churchForm)
      .subscribe({
        next: () => {
          this.successMessage = 'Church updated successfully!';
          this.processing = false;
          this.closeEditModal();
          this.loadChurches();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update church';
          this.processing = false;
        },
      });
  }

  deactivateChurch(church: Church): void {
    if (!confirm(`Are you sure you want to deactivate ${church.name}?`)) {
      return;
    }

    this.adminService.deleteChurch(church.id).subscribe({
      next: () => {
        this.successMessage = 'Church deactivated successfully!';
        this.loadChurches();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to deactivate church';
        setTimeout(() => (this.errorMessage = ''), 3000);
      },
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  toggleFeature(feature: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.churchForm.enabled_features = [
        ...this.churchForm.enabled_features,
        feature,
      ];
    } else {
      this.churchForm.enabled_features =
        this.churchForm.enabled_features.filter((f) => f !== feature);
    }
  }
}
