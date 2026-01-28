

// src/app/features/dashboard/components/revenue-chart/revenue-chart.component.ts
import { Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-revenue-chart',
  standalone: false,
  templateUrl: './revenue-chart.html',
  styleUrl: './revenue-chart.scss',
})
export class RevenueChart implements OnInit, AfterViewInit {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() chartData: any;

  selectedYear = 2025;
  years = [2023, 2024, 2025, 2026];

  ngOnInit(): void {
    // Component initialized
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  onYearChange(event: any): void {
    this.selectedYear = parseInt(event.target.value);
    // Reload chart data for selected year
    this.renderChart();
  }

  private renderChart(): void {
    if (!this.chartCanvas) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 300;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Chart data
    const labels = this.chartData.labels;
    const tithe = this.chartData.tithe;
    const offering = this.chartData.offering;

    // Chart dimensions
    const padding = 40;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);

    // Find max value
    const maxValue = Math.max(...tithe, ...offering);
    const yScale = chartHeight / maxValue;
    const xScale = chartWidth / (labels.length - 1);

    // Draw grid lines (optional)
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();
    }

    // Function to draw area
    const drawArea = (data: number[], color1: string, color2: string) => {
      // Create gradient
      const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(padding, canvas.height - padding);

      data.forEach((value, index) => {
        const x = padding + (index * xScale);
        const y = canvas.height - padding - (value * yScale);
        if (index === 0) {
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.lineTo(canvas.width - padding, canvas.height - padding);
      ctx.closePath();
      ctx.fill();
    };

    // Draw offering area (back layer)
    drawArea(offering, 'rgba(139, 92, 246, 0.4)', 'rgba(139, 92, 246, 0.1)');

    // Draw tithe area (front layer)
    drawArea(tithe, 'rgba(236, 72, 153, 0.5)', 'rgba(236, 72, 153, 0.1)');

    // Draw month labels
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Nunito Sans';
    ctx.textAlign = 'center';
    labels.forEach((label: string, index: number) => {
      const x = padding + (index * xScale);
      ctx.fillText(label, x, canvas.height - 10);
    });
  }
}
