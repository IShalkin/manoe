import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthenticatedSSEUrl } from '../lib/api';

// Event types from backend
export interface AgentMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface FactUpdate {
  subject: string;
  change: string;
  category: 'char' | 'world' | 'plot';
}

export interface WorldStateFact {
  key: string;
  value: string;
  scene_number: number;
  category: string;
  is_global?: boolean;
  source: 'raw' | 'canonical';
}

export interface GenerationStreamState {
  isConnected: boolean;
  isPaused: boolean;
  isReplay: boolean;
  currentPhase: string;
  activeAgent: string | null;
  messages: AgentMessage[];
  rawFacts: FactUpdate[];
  worldState: WorldStateFact[];
  error: string | null;
  isComplete: boolean;
  isCancelled: boolean;
}

interface UseGenerationStreamOptions {
  runId: string | null;
  onMessage?: (message: AgentMessage) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useGenerationStream({
  runId,
  onMessage,
  onComplete,
  onError,
}: UseGenerationStreamOptions): GenerationStreamState & {
  disconnect: () => void;
} {
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [rawFacts, setRawFacts] = useState<FactUpdate[]>([]);
  const [worldState, setWorldState] = useState<WorldStateFact[]>([]);
  const [isReplay, setIsReplay] = useState(true); // Start as replay until we receive replay_complete
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!runId) return;

    let isMounted = true;

    const connectSSE = async () => {
      try {
        const sseUrl = await getAuthenticatedSSEUrl(`/stream/${runId}`);
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
            setError(null);
          }
        };

        eventSource.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const rawData = JSON.parse(event.data);
            console.log('[useGenerationStream] Raw SSE event:', rawData);
            
            // Normalize the event to ensure consistent structure
            // Some events (like 'connected', 'ERROR') may not have a 'data' field
            // or may have data at the top level instead of nested
            const normalizedData: AgentMessage = {
              type: rawData.type ?? 'unknown',
              timestamp: rawData.timestamp,
              data: rawData.data ?? {},
            };
            
            // Handle legacy format where agent/thought might be at top level
            if (rawData.type === 'agent_thought' && !normalizedData.data.agent && rawData.agent) {
              normalizedData.data = { agent: rawData.agent, thought: rawData.thought, sentiment: rawData.sentiment };
            }
            if (rawData.type === 'agent_dialogue' && !normalizedData.data.from && rawData.from) {
              normalizedData.data = { from: rawData.from, to: rawData.to, message: rawData.message, dialogueType: rawData.dialogueType };
            }
            
            const data = normalizedData;

            // Handle connected event with run status
            if (rawData.type === 'connected') {
              // Extract run status from connected event
              if (rawData.isPaused !== undefined) {
                setIsPaused(rawData.isPaused);
              }
              if (rawData.isCompleted !== undefined) {
                setIsComplete(rawData.isCompleted);
              }
              if (rawData.status) {
                const phase = rawData.status as string;
                setCurrentPhase(phase.charAt(0).toUpperCase() + phase.slice(1));
              }
              if (rawData.error) {
                setError(rawData.error as string);
              }
              // If run is paused or completed, we're not in replay mode - we're just showing final state
              if (rawData.isPaused || rawData.isCompleted) {
                setIsReplay(false);
              }
              console.log('[useGenerationStream] Connected with status:', {
                isPaused: rawData.isPaused,
                isCompleted: rawData.isCompleted,
                phase: rawData.status,
                error: rawData.error
              });
            }

            // Handle replay_complete event - transition from replay to live
            if (rawData.type === 'replay_complete') {
              setIsReplay(false);
              console.log('[useGenerationStream] Replay complete, now streaming live events');
            }

            // Update phase
            if (data.type === 'phase_start' && data.data.phase) {
              const phase = data.data.phase as string;
              setCurrentPhase(phase.charAt(0).toUpperCase() + phase.slice(1));
            }

            // Update active agent
            if (data.type === 'agent_start') {
              setActiveAgent(data.data.agent as string);
            }
            if (data.type === 'agent_complete') {
              setActiveAgent(null);
            }
            
            // Update active agent from cinematic events
            if (data.type === 'agent_thought' || data.type === 'agent_dialogue') {
              const agentData = data.data as any;
              if (agentData.agent || agentData.from) {
                setActiveAgent(agentData.agent || agentData.from);
              }
            }

            // Collect new developments (raw facts from Writer)
            if (data.type === 'new_developments_collected') {
              const developments = data.data.developments as FactUpdate[];
              if (developments && Array.isArray(developments)) {
                setRawFacts((prev) => [...prev, ...developments]);
              }
            }

            // Handle archivist snapshot complete (canonical facts)
            if (data.type === 'phase_complete' && data.data.phase === 'archivist_snapshot') {
              const constraints = data.data.constraints_count as number;
              if (constraints !== undefined) {
                // Could fetch canonical state here if needed
              }
            }

            // Handle world state updates
            if (data.type === 'world_state_updated' || data.type === 'constraints_updated') {
              const facts = data.data.facts as WorldStateFact[] || data.data.constraints as WorldStateFact[];
              if (facts && Array.isArray(facts)) {
                setWorldState(facts);
              }
            }

            // Handle completion (support both old and new event names)
            if (data.type === 'generation_complete' || data.type === 'generation_completed') {
              setIsComplete(true);
              eventSource.close();
              setIsConnected(false);
              onComplete?.();
              return;
            }

            // Handle cancellation
            if (data.type === 'generation_cancelled') {
              setIsCancelled(true);
              eventSource.close();
              setIsConnected(false);
              return;
            }

            // Handle run not found (after server restart)
            if (data.type === 'run_not_found') {
              const errorMsg = data.data?.error as string || rawData.error as string || 'Run not found. Please start a new generation.';
              setError(errorMsg);
              eventSource.close();
              setIsConnected(false);
              onError?.(errorMsg);
              return;
            }

            // Handle errors (support both old and new event names)
            if (data.type === 'generation_error' || data.type === 'ERROR') {
              const errorMsg = data.data.error as string || 'Unknown error';
              setError(errorMsg);
              onError?.(errorMsg);
            }

            // Handle cinematic events
            if (
              data.type === "agent_thought" ||
              data.type === "agent_dialogue" ||
              data.type === "agent_conflict" ||
              data.type === "agent_consensus"
            ) {
              // These are handled specially in CinematicAgentPanel
              console.log('[useGenerationStream] Cinematic event received:', data.type, data);
            }

            // Store message
            setMessages((prev) => [...prev, data]);
            onMessage?.(data);

          } catch (e) {
            console.error('[useGenerationStream] Failed to parse event:', e);
          }
        };

        eventSource.onerror = () => {
          if (isMounted) {
            setError('Connection lost');
            setIsConnected(false);
          }
        };

      } catch (e) {
        if (isMounted) {
          const errorMsg = e instanceof Error ? e.message : 'Failed to connect';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      }
    };

    connectSSE();

    // CRITICAL: Cleanup function to prevent double connections in React 18 Strict Mode
    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [runId, onMessage, onComplete, onError]);

  return {
    isConnected,
    isPaused,
    isReplay,
    currentPhase,
    activeAgent,
    messages,
    rawFacts,
    worldState,
    error,
    isComplete,
    isCancelled,
    disconnect,
  };
}
