/**
 * Feedback Controller for MANOE
 * Handles user feedback (thumbs up/down) for quality evaluation
 * 
 * Features:
 * - Explicit feedback (thumbs up/down) on agent outputs
 * - Implicit feedback tracking (regeneration requests)
 * - Integration with Langfuse for quality scoring
 * - Integration with Prometheus metrics
 */

import { Controller, Post, BodyParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";

import { LangfuseService } from "../services/LangfuseService";
import { MetricsService } from "../services/MetricsService";

/**
 * User feedback request body
 */
interface FeedbackRequest {
  runId: string;
  projectId: string;
  agentName: string;
  feedbackType: "thumbs_up" | "thumbs_down";
  sceneNumber?: number;
  comment?: string;
}

/**
 * Regeneration feedback request body (implicit negative feedback)
 */
interface RegenerationFeedbackRequest {
  runId: string;
  projectId: string;
  agentName: string;
  sceneNumber?: number;
  reason?: string;
}

/**
 * Feedback response
 */
interface FeedbackResponse {
  success: boolean;
  message: string;
  feedbackId?: string;
}

@Controller("/feedback")
@Tags("Feedback")
@Description("User feedback endpoints for quality evaluation")
export class FeedbackController {
  @Inject()
  private langfuseService: LangfuseService;

  @Inject()
  private metricsService: MetricsService;

  @Post("/")
  @Summary("Submit user feedback")
  @Description("Submit thumbs up/down feedback for an agent output")
  @Returns(200)
  @Returns(400)
  async submitFeedback(
    @BodyParams() body: FeedbackRequest
  ): Promise<FeedbackResponse> {
    const { runId, agentName, feedbackType, sceneNumber, comment } = body;

    if (!runId || !agentName || !feedbackType) {
      return {
        success: false,
        message: "Missing required fields: runId, agentName, feedbackType",
      };
    }

    if (feedbackType !== "thumbs_up" && feedbackType !== "thumbs_down") {
      return {
        success: false,
        message: "feedbackType must be 'thumbs_up' or 'thumbs_down'",
      };
    }

    try {
      // Record feedback in Langfuse for quality tracking
      this.langfuseService.recordUserFeedback(
        runId,
        feedbackType,
        agentName,
        sceneNumber,
        comment
      );

      // Record feedback in Prometheus metrics
      this.metricsService.recordUserFeedback(feedbackType, agentName);

      const feedbackId = `${runId}-${agentName}-${Date.now()}`;

      console.log(
        `[FeedbackController] Recorded ${feedbackType} for ${agentName} in run ${runId}` +
        (sceneNumber ? ` (scene ${sceneNumber})` : "")
      );

      return {
        success: true,
        message: `Feedback recorded successfully`,
        feedbackId,
      };
    } catch (error) {
      console.error("[FeedbackController] Error recording feedback:", error);
      return {
        success: false,
        message: `Failed to record feedback: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  @Post("/regeneration")
  @Summary("Record regeneration request")
  @Description("Record a regeneration request as implicit negative feedback")
  @Returns(200)
  @Returns(400)
  async recordRegeneration(
    @BodyParams() body: RegenerationFeedbackRequest
  ): Promise<FeedbackResponse> {
    const { runId, agentName, sceneNumber, reason } = body;

    if (!runId || !agentName) {
      return {
        success: false,
        message: "Missing required fields: runId, agentName",
      };
    }

    try {
      // Record regeneration in Langfuse as implicit negative feedback
      this.langfuseService.recordRegenerationRequest(
        runId,
        agentName,
        sceneNumber,
        reason
      );

      // Record regeneration in Prometheus metrics
      this.metricsService.recordRegenerationRequest(agentName, sceneNumber);

      console.log(
        `[FeedbackController] Recorded regeneration for ${agentName} in run ${runId}` +
        (sceneNumber ? ` (scene ${sceneNumber})` : "") +
        (reason ? `: ${reason}` : "")
      );

      return {
        success: true,
        message: "Regeneration request recorded as implicit feedback",
      };
    } catch (error) {
      console.error("[FeedbackController] Error recording regeneration:", error);
      return {
        success: false,
        message: `Failed to record regeneration: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  @Post("/quality-score")
  @Summary("Submit quality score")
  @Description("Submit a quality score (faithfulness or relevance) for an agent output")
  @Returns(200)
  @Returns(400)
  async submitQualityScore(
    @BodyParams() body: {
      runId: string;
      agentName: string;
      scoreType: "faithfulness" | "relevance";
      value: number;
      comment?: string;
    }
  ): Promise<FeedbackResponse> {
    const { runId, agentName, scoreType, value, comment } = body;

    if (!runId || !agentName || !scoreType || value === undefined) {
      return {
        success: false,
        message: "Missing required fields: runId, agentName, scoreType, value",
      };
    }

    if (value < 0 || value > 1) {
      return {
        success: false,
        message: "value must be between 0 and 1",
      };
    }

    try {
      if (scoreType === "faithfulness") {
        this.langfuseService.scoreFaithfulness(runId, value, agentName, comment);
      } else if (scoreType === "relevance") {
        this.langfuseService.scoreRelevance(runId, value, agentName, comment);
      }

      console.log(
        `[FeedbackController] Recorded ${scoreType} score ${value} for ${agentName} in run ${runId}`
      );

      return {
        success: true,
        message: `Quality score recorded successfully`,
      };
    } catch (error) {
      console.error("[FeedbackController] Error recording quality score:", error);
      return {
        success: false,
        message: `Failed to record quality score: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}
