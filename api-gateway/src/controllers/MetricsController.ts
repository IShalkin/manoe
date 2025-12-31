/**
 * Metrics Controller for MANOE
 * Exposes Prometheus metrics endpoint for scraping
 */

import { Controller, Get, Res } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { Response } from "express";
import { MetricsService } from "../services/MetricsService";

@Controller("/metrics")
@Tags("Metrics")
@Description("Prometheus metrics endpoint")
export class MetricsController {
  @Inject()
  private metricsService: MetricsService;

  @Get("/")
  @Summary("Get Prometheus metrics")
  @Description("Returns all metrics in Prometheus text format for scraping")
  @Returns(200, String)
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.set("Content-Type", this.metricsService.getContentType());
    res.send(metrics);
  }
}
