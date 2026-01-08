/**
 * Metrics Controller for MANOE
 * Exposes Prometheus metrics endpoint for scraping
 */
import { Response } from "express";
export declare class MetricsController {
    private metricsService;
    getMetrics(res: Response): Promise<void>;
}
//# sourceMappingURL=MetricsController.d.ts.map