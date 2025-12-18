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
  const [currentPhase, setCurrentPhase] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [rawFacts, setRawFacts] = useState<FactUpdate[]>([]);
  const [worldState] = useState<WorldStateFact[]>([]);
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
        const sseUrl = await getAuthenticatedSSEUrl(`/runs/${runId}/events`);
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
            const data = rawData as AgentMessage;

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

            // Handle completion
            if (data.type === 'generation_complete') {
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

            // Handle errors
            if (data.type === 'generation_error') {
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
