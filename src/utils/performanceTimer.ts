/**
 * Request-scoped performance timing utility.
 *
 * Tracks stage durations without persisting state across requests.
 * Zero sensitive data logged.
 */
export class PerformanceTimer {
  private readonly startTimes: Map<string, number> = new Map();
  private readonly durations: Map<string, number> = new Map();
  private readonly globalStart: number;

  constructor() {
    this.globalStart = Date.now();
  }

  /**
   * Starts timing a named stage.
   */
  start(stage: string): void {
    this.startTimes.set(stage, Date.now());
  }

  /**
   * Stops timing a named stage and records duration in milliseconds.
   */
  stop(stage: string): number {
    const startTime = this.startTimes.get(stage);
    if (!startTime) {
      return 0;
    }
    const duration = Date.now() - startTime;
    this.durations.set(stage, (this.durations.get(stage) ?? 0) + duration);
    this.startTimes.delete(stage);
    return duration;
  }

  /**
   * Directly records an explicit duration for a named stage.
   */
  record(stage: string, durationMs: number): void {
    if (durationMs >= 0) {
      this.durations.set(stage, (this.durations.get(stage) ?? 0) + durationMs);
    }
  }

  /**
   * Retrieves the duration of a stage if completed.
   */
  getDuration(stage: string): number | undefined {
    return this.durations.get(stage);
  }

  /**
   * Returns total elapsed time from timer instantiation.
   */
  totalDuration(): number {
    return Date.now() - this.globalStart;
  }

  /**
   * Returns a clean structured map of all recorded stage durations.
   */
  summary(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.durations.entries()) {
      result[key] = value;
    }
    result.totalMs = this.totalDuration();
    return result;
  }
}
