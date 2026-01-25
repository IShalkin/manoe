import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthenticatedSSEUrl } from '../lib/api';
import type { NarrativePossibility, NarrativePossibilitiesRecommendation } from '../types';
import type {
  AgentMessage,
  CheckpointResult,
  MotifLayerResult,
  DiagnosticRubricResult,
  DiagnosticWeakestLinkResult,
  DiagnosticState,
  GenerationResult,
} from '../types/chat';

// Re-export AgentMessage for convenience
export type { AgentMessage } from '../types/chat';

export interface FactUpdate {
  subject: string;
  change: string;
  category: 'char' | 'world' | 'plot';
}

export interface GenerationStreamState {
  // Connection state
  isConnected: boolean;
  currentPhase: string;
  activeAgent: string | null;
  messages: AgentMessage[];
  error: string | null;
  isComplete: boolean;
  isCancelled: boolean;
  
  // World state (for WorldStatePanel)
  rawFacts: FactUpdate[];
  
  // Narrative Possibilities (Branching Mode)
  narrativePossibilities: NarrativePossibility[] | null;
  narrativeRecommendation: NarrativePossibilitiesRecommendation | null;
  
  // Checkpoints (Deepening Mode)
  checkpointResults: Record<string, CheckpointResult>;
  activeCheckpoint: string | null;
  
  // Motif Layer
  motifLayerResult: MotifLayerResult | null;
  isMotifPlanningActive: boolean;
  
  // Diagnostics (Two-Pass Critic)
  diagnosticResults: Record<number, DiagnosticState>;
  activeDiagnosticScene: number | null;
  
  // Interruption/Resume state
  isInterrupted: boolean;
}

export interface UseGenerationStreamOptions {
  runId: string | null;
  onMessage?: (message: AgentMessage) => void;
  onComplete?: (result?: GenerationResult) => void;
  onError?: (error: string) => void;
  
  // AgentChat specific callbacks
  onNarrativePossibilities?: (
    possibilities: NarrativePossibility[],
    recommendation: NarrativePossibilitiesRecommendation | null
  ) => void;
  onCheckpointStart?: (checkpointType: string, sceneNumber: number) => void;
  onCheckpointComplete?: (result: CheckpointResult) => void;
  onMotifPlanningStart?: () => void;
  onMotifPlanningComplete?: (result: MotifLayerResult) => void;
  onDiagnosticPassStart?: (sceneNumber: number) => void;
  onDiagnosticRubricComplete?: (result: DiagnosticRubricResult) => void;
  onDiagnosticWeakestLink?: (result: DiagnosticWeakestLinkResult) => void;
  onAgentMessage?: (agent: string, round: number) => void;
  onAgentComplete?: () => void;
  onCancelled?: () => void;
  onInterrupted?: (canResume: boolean, resumeFromPhase?: string, lastCompletedPhase?: string) => void;
}

export function useGenerationStream({
  runId,
  onMessage,
  onComplete,
  onError,
  onNarrativePossibilities,
  onCheckpointStart,
  onCheckpointComplete,
  onMotifPlanningStart,
  onMotifPlanningComplete,
  onDiagnosticPassStart,
  onDiagnosticRubricComplete,
  onDiagnosticWeakestLink,
  onAgentMessage,
  onAgentComplete,
  onCancelled,
  onInterrupted,
}: UseGenerationStreamOptions): GenerationStreamState & {
  disconnect: () => void;
  reconnect: () => void;
} {
  const [isConnected, setIsConnected] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [rawFacts, setRawFacts] = useState<FactUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  
  // Narrative Possibilities (Branching Mode)
  const [narrativePossibilities, setNarrativePossibilities] = useState<NarrativePossibility[] | null>(null);
  const [narrativeRecommendation, setNarrativeRecommendation] = useState<NarrativePossibilitiesRecommendation | null>(null);
  
  // Checkpoints (Deepening Mode)
  const [checkpointResults, setCheckpointResults] = useState<Record<string, CheckpointResult>>({});
  const [activeCheckpoint, setActiveCheckpoint] = useState<string | null>(null);
  
  // Motif Layer
  const [motifLayerResult, setMotifLayerResult] = useState<MotifLayerResult | null>(null);
  const [isMotifPlanningActive, setIsMotifPlanningActive] = useState(false);
  
  // Diagnostics (Two-Pass Critic)
  const [diagnosticResults, setDiagnosticResults] = useState<Record<number, DiagnosticState>>({});
  const [activeDiagnosticScene, setActiveDiagnosticScene] = useState<number | null>(null);
  
  // Interruption state
  const [isInterrupted, setIsInterrupted] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  // Track seen eventIds to prevent duplicate messages from SSE reconnects/replays
  // Use bounded size to prevent memory leaks in long sessions
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const MAX_SEEN_EVENT_IDS = 1000;
  // Maximum messages to store to prevent client-side DoS from malicious/misbehaving SSE streams
  const MAX_MESSAGES = 5000;
  
  // Track current round for agent messages
  const currentRoundRef = useRef(1);
  const hasMessageInCurrentRoundRef = useRef(false);

  // Use refs for callbacks to avoid recreating EventSource on callback changes
  const callbacksRef = useRef({
    onMessage,
    onComplete,
    onError,
    onNarrativePossibilities,
    onCheckpointStart,
    onCheckpointComplete,
    onMotifPlanningStart,
    onMotifPlanningComplete,
    onDiagnosticPassStart,
    onDiagnosticRubricComplete,
    onDiagnosticWeakestLink,
    onAgentMessage,
    onAgentComplete,
    onCancelled,
    onInterrupted,
  });
  
  // Keep refs up to date
  callbacksRef.current = {
    onMessage,
    onComplete,
    onError,
    onNarrativePossibilities,
    onCheckpointStart,
    onCheckpointComplete,
    onMotifPlanningStart,
    onMotifPlanningComplete,
    onDiagnosticPassStart,
    onDiagnosticRubricComplete,
    onDiagnosticWeakestLink,
    onAgentMessage,
    onAgentComplete,
    onCancelled,
    onInterrupted,
  };
  
  // Ref for messages to use in onComplete without causing effect re-runs
  const messagesRef = useRef<AgentMessage[]>([]);
  messagesRef.current = messages;

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setReconnectTrigger(prev => prev + 1);
  }, [disconnect]);

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
            
            // Normalize the event to ensure consistent structure
            // Some events (like 'connected', 'ERROR') may not have a 'data' field
            // or may have data at the top level instead of nested
            const normalizedData: AgentMessage = {
              type: rawData.type ?? 'unknown',
              timestamp: rawData.timestamp,
              eventId: rawData.eventId,  // Include eventId for deduplication
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

            // ============================================
            // Phase Events
            // ============================================
            if (data.type === 'phase_start' && data.data.phase) {
              const phase = data.data.phase as string;
              setCurrentPhase(phase.charAt(0).toUpperCase() + phase.slice(1));
            }

            // ============================================
            // Agent Events
            // ============================================
            if (data.type === 'agent_start') {
              setActiveAgent(data.data.agent as string);
            }
            if (data.type === 'agent_complete') {
              setActiveAgent(null);
              // Only increment round if we've seen at least one message in the current round
              if (hasMessageInCurrentRoundRef.current) {
                currentRoundRef.current += 1;
                hasMessageInCurrentRoundRef.current = false;
              }
              callbacksRef.current.onAgentComplete?.();
            }
            
            // Agent message with round tracking
            if (data.type === 'agent_message') {
              data.data.round = currentRoundRef.current;
              hasMessageInCurrentRoundRef.current = true;
              const agent = data.data.agent as string;
              callbacksRef.current.onAgentMessage?.(agent, currentRoundRef.current);
            }
            
            // Update active agent from cinematic events
            if (data.type === 'agent_thought' || data.type === 'agent_dialogue') {
              const agentData = data.data as Record<string, unknown>;
              if (agentData.agent || agentData.from) {
                setActiveAgent((agentData.agent || agentData.from) as string);
              }
            }

            // ============================================
            // Narrative Possibilities (Branching Mode)
            // ============================================
            if (data.type === 'narrative_possibilities_generated') {
              const possibilities = (data.data.possibilities as NarrativePossibility[]) || [];
              const recommendation = (data.data.recommendation as NarrativePossibilitiesRecommendation) || null;
              setNarrativePossibilities(possibilities);
              setNarrativeRecommendation(recommendation);
              setCurrentPhase('Select Narrative');
              setIsComplete(true);
              eventSource.close();
              setIsConnected(false);
              callbacksRef.current.onNarrativePossibilities?.(possibilities, recommendation);
              return;
            }

            // ============================================
            // Checkpoint Events (Deepening Mode)
            // ============================================
            if (data.type === 'checkpoint_start') {
              const checkpointType = data.data.checkpoint_type as string;
              const sceneNumber = data.data.scene_number as number;
              const checkpointKey = `${checkpointType}_scene${sceneNumber}`;
              setActiveCheckpoint(checkpointKey);
              setCheckpointResults(prev => ({
                ...prev,
                [checkpointKey]: {
                  checkpoint_type: checkpointType,
                  scene_number: sceneNumber,
                  passed: false,
                  overall_score: 0,
                },
              }));
              setCurrentPhase(`Checkpoint: ${checkpointType.replace(/_/g, ' ')}`);
              callbacksRef.current.onCheckpointStart?.(checkpointType, sceneNumber);
            }

            if (data.type === 'checkpoint_complete') {
              const result: CheckpointResult = {
                checkpoint_type: data.data.checkpoint_type as string,
                scene_number: data.data.scene_number as number,
                passed: data.data.passed as boolean,
                overall_score: data.data.overall_score as number,
                criteria_scores: data.data.criteria_scores as Record<string, { score: number; feedback: string }>,
              };
              const checkpointKey = `${result.checkpoint_type}_scene${result.scene_number}`;
              setCheckpointResults(prev => ({
                ...prev,
                [checkpointKey]: result,
              }));
              setActiveCheckpoint(null);
              callbacksRef.current.onCheckpointComplete?.(result);
            }

            // ============================================
            // Motif Layer Events
            // ============================================
            if (data.type === 'motif_planning_start') {
              setIsMotifPlanningActive(true);
              setCurrentPhase('Motif Layer Planning');
              callbacksRef.current.onMotifPlanningStart?.();
            }

            if (data.type === 'motif_planning_complete') {
              const result: MotifLayerResult = {
                core_symbols_count: data.data.core_symbols_count as number,
                character_motifs_count: data.data.character_motifs_count as number,
                scene_targets_count: data.data.scene_targets_count as number,
                has_structural_motifs: data.data.has_structural_motifs as boolean,
              };
              setMotifLayerResult(result);
              setIsMotifPlanningActive(false);
              callbacksRef.current.onMotifPlanningComplete?.(result);
            }

            // ============================================
            // Diagnostic Events (Two-Pass Critic)
            // ============================================
            if (data.type === 'diagnostic_pass_start') {
              const sceneNumber = data.data.scene_number as number;
              setActiveDiagnosticScene(sceneNumber);
              setDiagnosticResults(prev => ({
                ...prev,
                [sceneNumber]: {
                  scene_number: sceneNumber,
                  status: 'rubric_scanning',
                },
              }));
              setCurrentPhase(`Diagnostic: Scene ${sceneNumber}`);
              callbacksRef.current.onDiagnosticPassStart?.(sceneNumber);
            }

            if (data.type === 'diagnostic_rubric_complete') {
              const result: DiagnosticRubricResult = {
                scene_number: data.data.scene_number as number,
                overall_score: data.data.overall_score as number,
                dimensions: data.data.dimensions as Record<string, number>,
                didacticism_detected: data.data.didacticism_detected as boolean,
                cliches_found: (data.data.cliches_found as string[]) || [],
                evidence_quotes: (data.data.evidence_quotes as string[]) || [],
                weakness_candidates: (data.data.weakness_candidates as Array<{ dimension: string; score: number; reason: string }>) || [],
              };
              setDiagnosticResults(prev => ({
                ...prev,
                [result.scene_number]: {
                  ...prev[result.scene_number],
                  status: 'analyzing_weakness',
                  rubric: {
                    overall_score: result.overall_score,
                    dimensions: result.dimensions,
                    didacticism_detected: result.didacticism_detected,
                    cliches_found: result.cliches_found,
                    evidence_quotes: result.evidence_quotes,
                    weakness_candidates: result.weakness_candidates,
                  },
                },
              }));
              callbacksRef.current.onDiagnosticRubricComplete?.(result);
            }

            if (data.type === 'diagnostic_weakest_link') {
              const result: DiagnosticWeakestLinkResult = {
                scene_number: data.data.scene_number as number,
                weakest_link: data.data.weakest_link as string,
                severity: data.data.severity as string,
                evidence: data.data.evidence as string | undefined,
                revision_issues: data.data.revision_issues as string,
              };
              setDiagnosticResults(prev => ({
                ...prev,
                [result.scene_number]: {
                  ...prev[result.scene_number],
                  status: 'revision_sent',
                  weakest_link: {
                    dimension: result.weakest_link,
                    severity: result.severity,
                    evidence: result.evidence || '',
                    revision_issues: result.revision_issues,
                  },
                },
              }));
              setActiveDiagnosticScene(null);
              callbacksRef.current.onDiagnosticWeakestLink?.(result);
            }

            // ============================================
            // World State Events
            // ============================================
            if (data.type === 'new_developments_collected') {
              const developments = data.data.developments as FactUpdate[];
              if (developments && Array.isArray(developments)) {
                setRawFacts((prev) => {
                  const updated = [...prev, ...developments];
                  // Limit to prevent unbounded growth (facts are small, allow more)
                  if (updated.length > MAX_MESSAGES) {
                    return updated.slice(-MAX_MESSAGES);
                  }
                  return updated;
                });
              }
            }

            // Handle archivist snapshot complete (canonical facts)
            if (data.type === 'phase_complete' && data.data.phase === 'archivist_snapshot') {
              // Could fetch canonical state here if needed
            }

            // ============================================
            // Completion Events
            // ============================================
            if (data.type === 'generation_complete' || data.type === 'generation_completed') {
              setCurrentPhase('Complete');
              setIsComplete(true);
              eventSource.close();
              setIsConnected(false);
              
              // Build result from messages (use ref to avoid stale closure)
              const allMessages = [...messagesRef.current, data];
              const agentMessages = allMessages.filter(
                m => m.type === 'agent_message' && (m.data.content as string)?.trim()
              );
              const agentOutputs: Record<string, string> = {};
              agentMessages.forEach(m => {
                const agent = (m.data.agent as string) || 'Unknown';
                if (m.data.content) {
                  agentOutputs[agent] = m.data.content as string;
                }
              });
              
              // Try phase_complete with result first
              const phaseCompleteEvents = allMessages.filter(m => m.type === 'phase_complete' && m.data.result);
              if (phaseCompleteEvents.length > 0) {
                const genesisComplete = phaseCompleteEvents.find(m => m.data.phase === 'genesis');
                const phaseComplete = genesisComplete || phaseCompleteEvents[phaseCompleteEvents.length - 1];
                callbacksRef.current.onComplete?.({
                  narrative_possibility: phaseComplete.data.result as Record<string, unknown>,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Try generation_complete result_summary
              if (data.data.result_summary) {
                callbacksRef.current.onComplete?.({
                  story: data.data.result_summary as string,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Use Writer's last message as the story content
              const writerMessages = allMessages.filter(
                m => m.type === 'agent_message' && m.data.agent === 'Writer' && (m.data.content as string)?.trim()
              );
              if (writerMessages.length > 0) {
                callbacksRef.current.onComplete?.({
                  story: writerMessages[writerMessages.length - 1].data.content as string,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Fall back to all agent messages combined
              callbacksRef.current.onComplete?.({ agents: agentOutputs });
              return;
            }

            // ============================================
            // Cancellation Events
            // ============================================
            if (data.type === 'generation_cancelled') {
              setCurrentPhase('Cancelled');
              setIsCancelled(true);
              eventSource.close();
              setIsConnected(false);
              callbacksRef.current.onCancelled?.();
              return;
            }

            // ============================================
            // Error Events
            // ============================================
            if (data.type === 'generation_error' || data.type === 'ERROR') {
              const errorMsg = (data.data.error as string) || 'Unknown error';
              const interrupted = data.data.status === 'interrupted';
              
              if (interrupted) {
                setCurrentPhase('Interrupted');
                setIsInterrupted(true);
                setIsComplete(true);
                eventSource.close();
                setIsConnected(false);
                
                // Notify about interruption - caller can fetch run state for resume info
                callbacksRef.current.onInterrupted?.(true);
                callbacksRef.current.onComplete?.({ error: errorMsg });
              } else {
                setCurrentPhase('Error');
                setError(errorMsg);
                setIsComplete(true);
                eventSource.close();
                setIsConnected(false);
                callbacksRef.current.onError?.(errorMsg);
                callbacksRef.current.onComplete?.({ error: errorMsg });
              }
              return;
            }

            // ============================================
            // Cinematic Events (for CinematicAgentPanel)
            // ============================================
            if (
              data.type === "agent_thought" ||
              data.type === "agent_dialogue" ||
              data.type === "agent_conflict" ||
              data.type === "agent_consensus"
            ) {
              // These cinematic events are stored in messages array
              // and filtered by CinematicAgentPanel
            }

            // ============================================
            // Deduplication & Storage
            // ============================================
            // CRITICAL: Deduplicate events by eventId before storing
            // This prevents duplicate messages from SSE reconnects/replays
            if (data.eventId) {
              if (seenEventIdsRef.current.has(data.eventId)) {
                // Skip duplicate event silently
                return;
              }
              seenEventIdsRef.current.add(data.eventId);
              
              // Prevent unbounded growth - keep only last MAX_SEEN_EVENT_IDS events
              if (seenEventIdsRef.current.size > MAX_SEEN_EVENT_IDS) {
                const items = Array.from(seenEventIdsRef.current);
                seenEventIdsRef.current = new Set(items.slice(-MAX_SEEN_EVENT_IDS));
              }
            }

            // Store message with bounded array to prevent DoS
            setMessages((prev) => {
              const updated = [...prev, data];
              // Keep only last MAX_MESSAGES to prevent unbounded memory growth
              if (updated.length > MAX_MESSAGES) {
                return updated.slice(-MAX_MESSAGES);
              }
              return updated;
            });
            callbacksRef.current.onMessage?.(data);

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
          callbacksRef.current.onError?.(errorMsg);
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
  }, [runId, reconnectTrigger]);

  return {
    // Connection state
    isConnected,
    currentPhase,
    activeAgent,
    messages,
    error,
    isComplete,
    isCancelled,
    
    // World state
    rawFacts,
    
    // Narrative Possibilities
    narrativePossibilities,
    narrativeRecommendation,
    
    // Checkpoints
    checkpointResults,
    activeCheckpoint,
    
    // Motif Layer
    motifLayerResult,
    isMotifPlanningActive,
    
    // Diagnostics
    diagnosticResults,
    activeDiagnosticScene,
    
    // Interruption state
    isInterrupted,
    
    // Methods
    disconnect,
    reconnect,
  };
}
