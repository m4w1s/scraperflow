import type { CycleSummary } from '../types/scraper-flow-options.js';

export class CycleSummaryHelper {
  completed: boolean;
  stats: {
    totalPageCount: number;
    failedPageList: Set<number>;
    totalErrorCount: number;
    timings: {
      startedAt: number;
      total: number;
      avg: {
        all: [number, number];
        successful: [number, number];
        failed: [number, number];
      };
    };
  };

  constructor() {
    this.completed = false;
    this.stats = {
      totalPageCount: 0,
      failedPageList: new Set(),
      totalErrorCount: 0,
      timings: {
        startedAt: Date.now(),
        total: 0,
        avg: {
          all: [0, 0],
          successful: [0, 0],
          failed: [0, 0],
        },
      },
    };
  }

  setTotalTime(): void {
    this.stats.timings.total = Date.now() - this.stats.timings.startedAt;
  }

  addAvgTiming(type: 'all' | 'successful' | 'failed', time: number): void {
    const timing = this.stats.timings.avg[type];

    timing[0] += time;
    timing[1]++;
  }

  summarize(): CycleSummary {
    if (!this.stats.timings.total) {
      this.setTotalTime();
    }

    return Object.freeze({
      completed: this.completed,
      stats: Object.freeze({
        totalPageCount: this.stats.totalPageCount,
        failedPageList: [...this.stats.failedPageList],
        totalErrorCount: this.stats.totalErrorCount,
        timings: Object.freeze({
          startedAt: this.stats.timings.startedAt,
          total: this.stats.timings.total,
          avg: Object.freeze({
            all: this.stats.timings.avg.all[0] / this.stats.timings.avg.all[1] || 0,
            successful:
              this.stats.timings.avg.successful[0] / this.stats.timings.avg.successful[1] || 0,
            failed: this.stats.timings.avg.failed[0] / this.stats.timings.avg.failed[1] || 0,
          }),
        }),
      }),
    });
  }
}
