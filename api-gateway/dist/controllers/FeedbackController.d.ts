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
export declare class FeedbackController {
    private langfuseService;
    private metricsService;
    submitFeedback(body: FeedbackRequest): Promise<FeedbackResponse>;
    recordRegeneration(body: RegenerationFeedbackRequest): Promise<FeedbackResponse>;
    submitQualityScore(body: {
        runId: string;
        agentName: string;
        scoreType: "faithfulness" | "relevance";
        value: number;
        comment?: string;
    }): Promise<FeedbackResponse>;
}
export {};
//# sourceMappingURL=FeedbackController.d.ts.map