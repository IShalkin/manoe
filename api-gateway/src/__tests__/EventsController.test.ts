/**
 * Unit tests for EventsController terminal-event detection.
 *
 * Bug: the SSE loop treated `phase_complete` with phase==="drafting" as a
 * terminal event and closed the stream — cutting off polish / quality-gate /
 * generation_complete events. Only genuine end-of-run events should close it.
 */
import { EventsController } from "../controllers/EventsController";

type EventLike = { type: string; data: Record<string, unknown> };

// isTerminalEvent is a pure static helper extracted for testability.
const isTerminal = (e: EventLike): boolean =>
  (EventsController as unknown as { isTerminalEvent(e: EventLike): boolean }).isTerminalEvent(e);

describe("EventsController.isTerminalEvent", () => {
  it("treats generation_complete as terminal", () => {
    expect(isTerminal({ type: "generation_complete", data: {} })).toBe(true);
  });

  it("treats generation_error as terminal", () => {
    expect(isTerminal({ type: "generation_error", data: {} })).toBe(true);
  });

  // --- the bug: drafting phase completing must NOT end the stream ---
  it("does NOT treat phase_complete(drafting) as terminal", () => {
    expect(isTerminal({ type: "phase_complete", data: { phase: "drafting" } })).toBe(false);
  });

  it("does NOT treat phase_complete(polish) as terminal", () => {
    expect(isTerminal({ type: "phase_complete", data: { phase: "polish" } })).toBe(false);
  });

  it("does NOT treat ordinary agent events as terminal", () => {
    expect(isTerminal({ type: "agent_complete", data: {} })).toBe(false);
    expect(isTerminal({ type: "phase_start", data: { phase: "polish" } })).toBe(false);
  });
});
