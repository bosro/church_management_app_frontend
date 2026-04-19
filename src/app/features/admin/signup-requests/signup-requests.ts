import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../core/services/auth';
import { SignupRequest } from '../../../models/user.model';
import { Church } from '../../../models/church.model';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-signup-requests',
  standalone: false,
  templateUrl: './signup-requests.html',
  styleUrl: './signup-requests.scss',
})
export class SignupRequests implements OnInit {
  requests: SignupRequest[] = [];
  filteredRequests: SignupRequest[] = [];
  churches: Church[] = [];
  loading = false;
  selectedStatus = 'pending';

  // Modal states
  showApprovalModal = false;
  showRejectionModal = false;
  selectedRequest: SignupRequest | null = null;
  selectedChurchId: string = '';
  rejectionReason: string = '';

  processing = false;
  errorMessage = '';
  successMessage = '';
  statusOptions = [
    { value: 'all', label: 'All', icon: 'ri-list-check', color: '#6B7280' }, // ✅ NEW
    {
      value: 'pending',
      label: 'Pending',
      icon: 'ri-time-line',
      color: '#F59E0B',
    },
    {
      value: 'approved',
      label: 'Approved',
      icon: 'ri-checkbox-circle-line',
      color: '#10B981',
    },
    {
      value: 'rejected',
      label: 'Rejected',
      icon: 'ri-close-circle-line',
      color: '#EF4444',
    },
  ];

  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadRequests();
    this.loadChurches();
  }

  loadRequests(): void {
    this.loading = true;
    this.errorMessage = '';

    // ✅ Always load ALL requests
    this.adminService.getSignupRequests().subscribe({
      next: (data) => {
        this.requests = data; // Store full list
        this.applyFilter(); // Apply filter for display
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load requests';
        this.loading = false;
      },
    });
  }

  applyFilter(): void {
    if (this.selectedStatus === 'all') {
      this.filteredRequests = [...this.requests];
    } else {
      this.filteredRequests = this.requests.filter(
        (r) => r.status === this.selectedStatus,
      );
    }
  }

  loadChurches(): void {
    this.adminService.getAllChurches().subscribe({
      next: (data) => {
        this.churches = data.filter((c) => c.is_active);
      },
      error: (error) => {
        console.error('Failed to load churches:', error);
      },
    });
  }

  filterByStatus(status: string): void {
    this.selectedStatus = status;
    this.applyFilter(); // ✅ Filter for display only
  }

  openApprovalModal(request: SignupRequest): void {
    this.selectedRequest = request;
    this.selectedChurchId = request.church_id || '';
    this.showApprovalModal = true;
    this.errorMessage = '';
  }

  closeApprovalModal(): void {
    this.showApprovalModal = false;
    this.selectedRequest = null;
    this.selectedChurchId = '';
  }

  openRejectionModal(request: SignupRequest): void {
    this.selectedRequest = request;
    this.rejectionReason = '';
    this.showRejectionModal = true;
    this.errorMessage = '';
  }

  closeRejectionModal(): void {
    this.showRejectionModal = false;
    this.selectedRequest = null;
    this.rejectionReason = '';
  }

  approveRequest(): void {
    if (!this.selectedRequest) return;

    this.processing = true;
    this.errorMessage = '';

    const adminId = this.authService.getUserId();

    this.adminService
      .approveSignupRequest(
        this.selectedRequest.id,
        this.selectedChurchId || undefined,
        adminId,
      )
      .subscribe({
        next: (response) => {
          this.successMessage = 'Signup request approved successfully!';
          this.processing = false;
          this.closeApprovalModal();
          this.loadRequests(); // ✅ Reload full data

          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to approve request';
          this.processing = false;
        },
      });
  }

  rejectRequest(): void {
    if (!this.selectedRequest) return;

    this.processing = true;
    this.errorMessage = '';

    const adminId = this.authService.getUserId();

    this.adminService
      .rejectSignupRequest(
        this.selectedRequest.id,
        this.rejectionReason,
        adminId,
      )
      .subscribe({
        next: (response) => {
          this.successMessage = 'Signup request rejected';
          this.processing = false;
          this.closeRejectionModal();
          this.loadRequests(); // ✅ Reload full data

          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to reject request';
          this.processing = false;
        },
      });
  }

  getStatusBadgeClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-danger',
    };
    return statusMap[status] || 'badge-secondary';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStatusCount(status: string): number {
    return this.requests.filter((r) => r.status === status).length;
  }

  getRoleBadge(position: string): string {
    const roleMap: { [key: string]: string } = {
      senior_pastor: 'Pastor',
      associate_pastor: 'Pastor',
      church_administrator: 'Admin',
      worship_leader: 'Ministry Leader',
      youth_pastor: 'Ministry Leader',
      elder: 'Elder',
    };
    return roleMap[position] || 'Member';
  }
}





