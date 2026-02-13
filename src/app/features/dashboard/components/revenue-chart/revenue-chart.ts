// src/app/features/dashboard/components/revenue-chart/revenue-chart.component.ts
import { Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';

interface ChartData {
  labels: string[];
  tithe: number[];
  offering: number[];
  seed?: number[];
}

@Component({
  selector: 'app-revenue-chart',
  standalone: false,
  templateUrl: './revenue-chart.html',
  styleUrl: './revenue-chart.scss',
})
export class RevenueChart implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() chartData: ChartData = {
    labels: [],
    tithe: [],
    offering: [],
    seed: []
  };

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  ngOnInit(): void {
    // Generate years (current year and 2 years back)
    const currentYear = new Date().getFullYear();
    this.years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    this.selectedYear = currentYear;
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.renderChart();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] && !changes['chartData'].firstChange) {
      setTimeout(() => {
        this.renderChart();
      }, 100);
    }
  }

  onYearChange(event: any): void {
    this.selectedYear = parseInt(event.target.value);
    // In a real app, fetch data for selected year
    this.renderChart();
  }

  private renderChart(): void {
    if (!this.chartCanvas) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for responsiveness
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.offsetWidth;
      canvas.height = 300;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no data, show empty state
    if (!this.chartData.labels || this.chartData.labels.length === 0) {
      this.drawEmptyState(ctx, canvas);
      return;
    }

    // Chart data
    const labels = this.chartData.labels;
    const tithe = this.chartData.tithe || [];
    const offering = this.chartData.offering || [];

    // Chart dimensions
    const padding = 50;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);

    // Find max value
    const maxValue = Math.max(...tithe, ...offering, 1);
    const yScale = chartHeight / maxValue;
    const xScale = chartWidth / (labels.length > 1 ? labels.length - 1 : 1);

    // Draw Y-axis labels
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const value = (maxValue / 4) * (4 - i);
      const y = padding + (chartHeight / 4) * i;
      ctx.fillText(this.formatCurrency(value), padding - 10, y + 4);
    }

    // Draw grid lines
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();
    }

    // Function to draw curved area
    const drawCurvedArea = (data: number[], color1: string, color2: string) => {
      if (data.length === 0) return;

      const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(padding, canvas.height - padding);

      // Draw smooth curve using quadratic curves
      data.forEach((value, index) => {
        const x = padding + (index * xScale);
        const y = canvas.height - padding - (value * yScale);

        if (index === 0) {
          ctx.lineTo(x, y);
        } else {
          const prevX = padding + ((index - 1) * xScale);
          const prevY = canvas.height - padding - (data[index - 1] * yScale);
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
          if (index === data.length - 1) {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.lineTo(canvas.width - padding, canvas.height - padding);
      ctx.closePath();
      ctx.fill();
    };

    // Draw offering area (back layer)
    drawCurvedArea(offering, 'rgba(139, 92, 246, 0.4)', 'rgba(139, 92, 246, 0.05)');

    // Draw tithe area (front layer)
    drawCurvedArea(tithe, 'rgba(236, 72, 153, 0.5)', 'rgba(236, 72, 153, 0.05)');

    // Draw month labels
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label: string, index: number) => {
      const x = padding + (index * xScale);
      ctx.fillText(label, x, canvas.height - padding + 20);
    });
  }

  private drawEmptyState(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No revenue data available', canvas.width / 2, canvas.height / 2);
  }

  private formatCurrency(value: number): string {
    if (value >= 1000000) {
      return `₵${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `₵${(value / 1000).toFixed(1)}K`;
    }
    return `₵${value.toFixed(0)}`;
  }
}
