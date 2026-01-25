import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { orchestratorFetch } from '../lib/api';
import { NarrativePossibilitiesSelector } from './NarrativePossibilitiesSelector';
import { FeedbackButtons } from './FeedbackButtons';
import { MarkdownContent } from './chat/MarkdownContent';
import { ChatHeader } from './chat/ChatHeader';
import { RoundSwitcher } from './chat/RoundSwitcher';
import { ResultSection } from './chat/ResultSection';
import type {
  AgentChatProps,
  EditState,
  AgentName,
  AgentState,
} from '../types/chat';
import {
  AGENTS,
  AGENT_DEPENDENCIES,
  AGENT_TO_PHASE,
  AGENT_COLORS,
  AGENT_BORDER_COLORS,
  AGENT_GLOW_COLORS,
  AGENT_DESCRIPTIONS,
  AGENT_TEXT_COLORS,
  AGENT_ICONS,
  normalizeAgentName,
  getPhasesToRegenerate,
} from '../types/chat';
import {
  extractStoryText,
  formatAgentContent,
  formatStrategistContent,
} from '../utils/formatting';

export function AgentChat({
  // Identification
  runId,
  projectId,
  
  // SSE Data (from parent)
  messages,
  isConnected,
  currentPhase,
  activeAgent,
  isComplete,
  isCancelled,
  error: sseError,
  
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
  
  // Interruption
  isInterrupted,
  
  // Project data
  projectResult,
  
  // Callbacks
  onClose,
  onUpdateResult,
  onRegenerate,
  onNarrativePossibilitySelected,
  onResume,
  onReconnect,
}: AgentChatProps) {
  // Local UI state only
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [isSelectingNarrative, setIsSelectingNarrative] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Edit state
  const [editState, setEditState] = useState<EditState | null>(null);
  const [lockedAgents, setLockedAgents] = useState<Record<string, boolean>>(() => projectResult?.locks || {});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editComment, setEditComment] = useState('');
  const [agentsToRegenerate, setAgentsToRegenerate] = useState<string[]>([]);
  const [pendingEdit, setPendingEdit] = useState<{ agent: string; content: string } | null>(null);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<number[]>([]);
  const [sceneCount, setSceneCount] = useState(0);
  
  // Resume state (local loading flags)
  const [canResume, setCanResume] = useState(false);
  const [resumeFromPhase, setResumeFromPhase] = useState<string | null>(null);
  const [lastCompletedPhase, setLastCompletedPhase] = useState<string | null>(null);
  const [isLoadingResumeState, setIsLoadingResumeState] = useState(false);
  
  // Local error state (for API errors, not SSE errors)
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Combine SSE error and local error
  const error = sseError || localError;

  // Sync locked agents from projectResult
  useEffect(() => {
    if (projectResult?.locks) {
      setLockedAgents(projectResult.locks);
    }
  }, [projectResult?.locks]);

  // Reset local UI state when runId changes
  useEffect(() => {
    if (runId) {
      // Reset local UI state for new run
      setIsCancelling(false);
      setSelectedRound(null);
      setIsPlaying(false);
      // Reset edit state
      setEditState(null);
      setShowConfirmModal(false);
      setEditComment('');
      setAgentsToRegenerate([]);
      setPendingEdit(null);
      // Reset scene selection state
      setShowSceneModal(false);
      setSelectedScenes([]);
      setSceneCount(0);
      // Reset resume state
      setCanResume(false);
      setResumeFromPhase(null);
      setLastCompletedPhase(null);
      setIsLoadingResumeState(false);
      setLocalError(null);
    }
  }, [runId]);

  // Fetch resume state when interrupted
  useEffect(() => {
    if (isInterrupted && runId && !canResume && !isLoadingResumeState) {
      setIsLoadingResumeState(true);
      orchestratorFetch(`/runs/${runId}/state`, { method: 'GET' })
        .then(response => response.ok ? response.json() : null)
        .then(state => {
          if (state && state.can_resume) {
            setCanResume(true);
            setResumeFromPhase(state.resume_from_phase);
            setLastCompletedPhase(state.last_completed_phase);
          }
        })
        .catch(err => console.error('Failed to fetch run state:', err))
        .finally(() => setIsLoadingResumeState(false));
    }
  }, [isInterrupted, runId, canResume, isLoadingResumeState]);

  // Handle stop generation (uses pause so it can be resumed)
  // Note: SSE state (isCancelled, isConnected, currentPhase) is managed by useGenerationStream
  // via generation_cancelled event from the server
  const handleStopGeneration = useCallback(async () => {
    if (!runId || isCancelling || isComplete) return;
    
    setIsCancelling(true);
    
    try {
      // Call pause endpoint (not cancel) so generation can be resumed
      const response = await orchestratorFetch(`/runs/${runId}/pause`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Failed to pause generation');
      }
      // SSE state updates will be handled by the hook via generation_cancelled event
    } catch (err) {
      console.error('Failed to pause generation:', err);
    } finally {
      setIsCancelling(false);
    }
  }, [runId, isCancelling, isComplete]);

  // Handle resume generation after pause
  // Note: SSE reconnection is triggered via onReconnect callback to parent
  const handleResumeGeneration = useCallback(async () => {
    if (!runId || isResuming || !isCancelled) return;
    
    setIsResuming(true);
    
    try {
      // Call resume endpoint
      const response = await orchestratorFetch(`/runs/${runId}/resume`, {
        method: 'POST',
      });
      
      if (response.ok) {
        // Trigger SSE reconnection via parent's hook
        onReconnect?.();
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('Failed to resume:', errorData);
        setLocalError(`Failed to resume: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to resume generation:', err);
      setLocalError('Failed to resume generation. Please try again.');
    } finally {
      setIsResuming(false);
    }
  }, [runId, isResuming, isCancelled, onReconnect]);

  // Handle resume interrupted generation (after redeploy)
  const handleResumeInterrupted = useCallback(async () => {
    if (!runId || !onResume || isLoadingResumeState) return;
    
    setIsLoadingResumeState(true);
    
    try {
      // Fetch run state to get resume parameters
      const response = await orchestratorFetch(`/runs/${runId}/state`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const state = await response.json();
        if (state.can_resume && state.resume_from_phase) {
          // Call parent's onResume with the parameters
          onResume(runId, state.resume_from_phase);
        } else {
          setLocalError('This run cannot be resumed. Please start a new generation.');
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('Failed to get run state:', errorData);
        setLocalError(`Failed to get run state: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to resume interrupted generation:', err);
      setLocalError('Failed to resume generation. Please try again.');
    } finally {
      setIsLoadingResumeState(false);
    }
  }, [runId, onResume, isLoadingResumeState]);

  const getAgentContent = useCallback((agent: string): string => {
    if (projectResult?.edits?.[agent]) {
      return projectResult.edits[agent].content;
    }
    if (projectResult?.agentOutputs?.[agent]) {
      return projectResult.agentOutputs[agent];
    }
    // Look for agent_message events (original format)
    const agentMessages = messages.filter(
      m => m.type === 'agent_message' && normalizeAgentName(m.data.agent as string) === agent && m.data.content?.trim()
    );
    if (agentMessages.length > 0) {
      return agentMessages[agentMessages.length - 1].data.content || '';
    }
    // Also look for agent_thought events (cinematic format from backend)
    // Backend sends: { type: "agent_thought", data: { agent: "architect", thought: "..." } }
    const thoughtMessages = messages.filter(
      m => m.type === 'agent_thought' && normalizeAgentName(m.data.agent as string) === agent && m.data.thought
    );
    if (thoughtMessages.length > 0) {
      return thoughtMessages[thoughtMessages.length - 1].data.thought as string || '';
    }
    return '';
  }, [messages, projectResult]);

  const handleStartEdit = useCallback((agent: string) => {
    const content = getAgentContent(agent);
    setEditState({
      agent,
      content,
      originalContent: content,
    });
  }, [getAgentContent]);

  const handleCancelEdit = useCallback(() => {
    setEditState(null);
  }, []);

  const handleApplyEdit = useCallback(() => {
    if (!editState) return;
    
    const affectedAgents = AGENT_DEPENDENCIES[editState.agent as AgentName] || [];
    const unlockedAffected = affectedAgents.filter(a => !lockedAgents[a]);
    
    setPendingEdit({ agent: editState.agent, content: editState.content });
    setAgentsToRegenerate(unlockedAffected);
    setEditComment('');
    setShowConfirmModal(true);
  }, [editState, lockedAgents]);

  const handleToggleLock = useCallback((agent: string) => {
    const newLocks = { ...lockedAgents, [agent]: !lockedAgents[agent] };
    setLockedAgents(newLocks);
    
    if (onUpdateResult && projectResult) {
      onUpdateResult({
        ...projectResult,
        locks: newLocks,
      });
    }
  }, [lockedAgents, onUpdateResult, projectResult]);

  const handleToggleAgentRegenerate = useCallback((agent: string) => {
    setAgentsToRegenerate(prev => 
      prev.includes(agent) 
        ? prev.filter(a => a !== agent)
        : [...prev, agent]
    );
  }, []);

  const handleConfirmRegenerate = useCallback(() => {
    if (!pendingEdit || !editComment.trim()) return;
    
    const lockedAgentContents: Record<string, string> = {};
    AGENTS.forEach(agent => {
      if (lockedAgents[agent]) {
        lockedAgentContents[agent] = getAgentContent(agent);
      }
    });
    
    if (onUpdateResult && projectResult) {
      const newEdits = {
        ...projectResult.edits,
        [pendingEdit.agent]: {
          content: pendingEdit.content,
          comment: editComment,
          updatedAt: new Date().toISOString(),
        },
      };
      onUpdateResult({
        ...projectResult,
        edits: newEdits,
      });
    }
    
    if (onRegenerate) {
      onRegenerate({
        editComment,
        editedAgent: pendingEdit.agent,
        editedContent: pendingEdit.content,
        lockedAgents: lockedAgentContents,
        agentsToRegenerate,
      });
    }
    
    setShowConfirmModal(false);
    setEditState(null);
    setPendingEdit(null);
    setEditComment('');
    setAgentsToRegenerate([]);
  }, [pendingEdit, editComment, lockedAgents, agentsToRegenerate, onUpdateResult, onRegenerate, projectResult, getAgentContent]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirmModal(false);
    setPendingEdit(null);
    setEditComment('');
    setAgentsToRegenerate([]);
  }, []);

  const handleOpenSceneModal = useCallback(() => {
    const writerMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
    );
    setSceneCount(writerMessages.length);
    setSelectedScenes([]);
    setShowSceneModal(true);
  }, [messages]);

  const handleToggleScene = useCallback((sceneNumber: number) => {
    setSelectedScenes(prev => 
      prev.includes(sceneNumber) 
        ? prev.filter(s => s !== sceneNumber)
        : [...prev, sceneNumber]
    );
  }, []);

  const handleSelectAllScenes = useCallback(() => {
    if (selectedScenes.length === sceneCount) {
      setSelectedScenes([]);
    } else {
      setSelectedScenes(Array.from({ length: sceneCount }, (_, i) => i + 1));
    }
  }, [selectedScenes.length, sceneCount]);

  const handleConfirmSceneRegenerate = useCallback(() => {
    if (selectedScenes.length === 0 || !onRegenerate) return;
    
    const lockedAgentContents: Record<string, string> = {};
    AGENTS.forEach(agent => {
      if (lockedAgents[agent]) {
        lockedAgentContents[agent] = getAgentContent(agent);
      }
    });
    
    onRegenerate({
      editComment: `Regenerating scenes: ${selectedScenes.sort((a, b) => a - b).join(', ')}`,
      editedAgent: 'Writer',
      editedContent: getAgentContent('Writer'),
      lockedAgents: lockedAgentContents,
      agentsToRegenerate: ['Writer', 'Critic'],
      scenesToRegenerate: selectedScenes,
    });
    
    setShowSceneModal(false);
    setSelectedScenes([]);
  }, [selectedScenes, onRegenerate, lockedAgents, getAgentContent]);

  const handleCancelSceneModal = useCallback(() => {
    setShowSceneModal(false);
    setSelectedScenes([]);
  }, []);

  // SSE connection is now managed by useGenerationStream hook in parent
  // All SSE data is received via props

  // Compute available rounds from messages
  const rounds = useMemo(() => {
    const roundSet = new Set<number>();
    messages.forEach(msg => {
      if (msg.type === 'agent_message' && msg.data.content) {
        // Use round from message, default to 1 if not set
        const round = msg.data.round ?? 1;
        roundSet.add(round);
      }
    });
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [messages]);

  // Playback functionality for cinematic viewing
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      setSelectedRound(1);
      
      playbackIntervalRef.current = setInterval(() => {
        setSelectedRound(prev => {
          const currentIdx = prev ? rounds.indexOf(prev) : -1;
          const nextIdx = currentIdx + 1;
          if (nextIdx >= rounds.length) {
            if (playbackIntervalRef.current) {
              clearInterval(playbackIntervalRef.current);
              playbackIntervalRef.current = null;
            }
            setIsPlaying(false);
            return null;
          }
          return rounds[nextIdx];
        });
      }, 3000);
    }
  }, [isPlaying, rounds]);

  // Cleanup playback interval on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  // Compute agent states from messages
  const agentStates = useMemo(() => {
    const states: Record<string, AgentState> = {};
    
    AGENTS.forEach(agent => {
      states[agent] = { status: 'idle', messages: [], lastUpdate: '' };
    });
    
    messages.forEach(msg => {
      // Defensive check: msg.data may be undefined for some event types
      if (!msg.data || typeof msg.data !== 'object') return;
      // Normalize agent name from backend (lowercase) to frontend (title case)
      const rawAgent = (msg.data.agent || msg.data.from) as string | undefined;
      const agent = normalizeAgentName(rawAgent);
      if (!agent || !states[agent]) return;
      
      if (msg.type === 'agent_start') {
        states[agent].status = 'thinking';
        states[agent].lastUpdate = msg.timestamp || '';
      } else if (msg.type === 'agent_complete') {
        states[agent].status = 'complete';
        states[agent].lastUpdate = msg.timestamp || '';
      } else if (msg.type === 'agent_message' && msg.data.content) {
        states[agent].messages.push({
          content: msg.data.content as string,
          round: (msg.data.round as number) || 1,
          timestamp: msg.timestamp || '',
        });
        states[agent].lastUpdate = msg.timestamp || '';
      } else if (msg.type === 'agent_thought' && msg.data.thought) {
        // Handle agent_thought events from backend cinematic UI
        // Treat first thought as "thinking" status, subsequent as messages
        if (states[agent].status === 'idle') {
          states[agent].status = 'thinking';
        }
        states[agent].messages.push({
          content: msg.data.thought as string,
          round: 1,
          timestamp: msg.timestamp || '',
        });
        states[agent].lastUpdate = msg.timestamp || '';
      }
    });
    
    return states;
  }, [messages]);

  // activeAgent now comes from props (via useGenerationStream hook)

  // Extract final result from messages - prefer assembled scene events over individual agent messages
  // CRITICAL: Deduplicate by sceneNum to prevent text duplication from SSE reconnects/replays
  const finalResult = useMemo(() => {
    // Helper to deduplicate events by sceneNum, keeping the latest one per scene
    const dedupeBySceneNum = <T extends { data: { sceneNum?: number } }>(events: T[]): T[] => {
      const sceneMap = new Map<number, T>();
      events.forEach(event => {
        const sceneNum = event.data.sceneNum ?? 0;
        sceneMap.set(sceneNum, event); // Later events overwrite earlier ones
      });
      return Array.from(sceneMap.values());
    };

    // DEBUG: Log all scene-related events for debugging duplication issues
    const scenePolishEvents = messages.filter(m => m.type === 'scene_polish_complete');
    const sceneExpandEvents = messages.filter(m => m.type === 'scene_expand_complete');
    const writerMsgs = messages.filter(m => m.type === 'agent_message' && m.data.agent === 'Writer');
    console.log('[finalResult DEBUG] Event counts:', {
      scene_polish_complete: scenePolishEvents.length,
      scene_polish_with_finalContent: scenePolishEvents.filter(m => m.data.finalContent).length,
      scene_expand_complete: sceneExpandEvents.length,
      writer_messages: writerMsgs.length,
      writer_with_sceneNum: writerMsgs.filter(m => m.data.sceneNum !== undefined).length,
    });
    if (scenePolishEvents.length > 0) {
      console.log('[finalResult DEBUG] scene_polish_complete events:', scenePolishEvents.map(m => ({
        sceneNum: m.data.sceneNum,
        hasFinalContent: !!m.data.finalContent,
        polishStatus: m.data.polishStatus,
        wordCount: m.data.wordCount,
      })));
    }
    if (writerMsgs.length > 0) {
      console.log('[finalResult DEBUG] Writer messages sceneNums:', writerMsgs.map(m => m.data.sceneNum));
    }

    // PRIORITY 1: Use scene_polish_complete events with finalContent (canonical source of truth)
    const polishCompleteEvents = messages.filter(
      m => m.type === 'scene_polish_complete' && m.data.finalContent
    );
    if (polishCompleteEvents.length > 0) {
      console.log('[finalResult] Using PRIORITY 1: scene_polish_complete events');
      // Deduplicate by scene number, then sort and join
      const dedupedEvents = dedupeBySceneNum(polishCompleteEvents);
      const sortedScenes = dedupedEvents
        .sort((a, b) => (a.data.sceneNum || 0) - (b.data.sceneNum || 0))
        .map(m => m.data.finalContent as string)
        .filter(text => text?.trim());
      
      if (sortedScenes.length > 0) {
        console.log('[finalResult] PRIORITY 1: Returning', sortedScenes.length, 'scenes');
        return sortedScenes.join('\n\n---\n\n');
      }
    }

    // PRIORITY 2: Use scene_expand_complete events with assembledContent (for scenes without polish)
    const expandCompleteEvents = messages.filter(
      m => m.type === 'scene_expand_complete' && m.data.assembledContent
    );
    if (expandCompleteEvents.length > 0) {
      console.log('[finalResult] Using PRIORITY 2: scene_expand_complete events');
      // Deduplicate by scene number, then sort and join
      const dedupedEvents = dedupeBySceneNum(expandCompleteEvents);
      const sortedScenes = dedupedEvents
        .sort((a, b) => (a.data.sceneNum || 0) - (b.data.sceneNum || 0))
        .map(m => m.data.assembledContent as string)
        .filter(text => text?.trim());
      
      if (sortedScenes.length > 0) {
        console.log('[finalResult] PRIORITY 2: Returning', sortedScenes.length, 'scenes');
        return sortedScenes.join('\n\n---\n\n');
      }
    }

    // PRIORITY 3: Collect Polish agent messages, deduplicate by sceneNum
    // NOTE: agent_message events from BaseAgent.emitMessage() don't include sceneNum in their payload,
    // so m.data.sceneNum will be undefined and all messages map to scene 0. This is a known limitation.
    // PRIORITY 1 (scene_polish_complete) is the canonical path and always includes sceneNum.
    // This fallback rarely executes in practice.
    const polishMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Polish' && m.data.content?.trim()
    );
    if (polishMessages.length > 0) {
      console.log('[finalResult] Using PRIORITY 3: Polish agent messages');
      // Deduplicate by sceneNum - keep only the latest Polish message per scene
      const sceneMap = new Map<number, string>();
      polishMessages.forEach(m => {
        const sceneNum = m.data.sceneNum ?? 0;
        if (sceneNum === 0) {
          console.warn('[finalResult] WARNING: Polish message has no sceneNum, using fallback index 0');
        }
        const text = extractStoryText(m.data.content || '', 'Polish');
        if (text.trim()) {
          sceneMap.set(sceneNum, text);
        }
      });
      
      if (sceneMap.size > 0) {
        const sortedScenes = Array.from(sceneMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, text]) => text);
        console.log('[finalResult] PRIORITY 3: Returning', sortedScenes.length, 'scenes from sceneMap');
        return sortedScenes.join('\n\n---\n\n');
      }
    }
    
    // PRIORITY 4: Fall back to Writer's messages, deduplicate by sceneNum
    const writerMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
    );
    if (writerMessages.length > 0) {
      console.log('[finalResult] Using PRIORITY 4: Writer agent messages');
      // Deduplicate by sceneNum - keep only the latest Writer message per scene
      const sceneMap = new Map<number, string>();
      writerMessages.forEach(m => {
        const sceneNum = m.data.sceneNum ?? 0;
        if (sceneNum === 0) {
          console.warn('[finalResult] WARNING: Writer message has no sceneNum, using fallback index 0');
        }
        const text = extractStoryText(m.data.content || '', 'Writer');
        if (text.trim()) {
          sceneMap.set(sceneNum, text);
        }
      });
      
      if (sceneMap.size > 0) {
        const sortedScenes = Array.from(sceneMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, text]) => text);
        console.log('[finalResult] PRIORITY 4: Returning', sortedScenes.length, 'scenes from sceneMap');
        return sortedScenes.join('\n\n---\n\n');
      }
    }
    
    // PRIORITY 5: Try generation_complete result_summary as fallback
    const completeEvent = messages.find(m => m.type === 'generation_complete');
    if (completeEvent?.data.result_summary) {
      console.log('[finalResult] Using PRIORITY 5: generation_complete result_summary');
      // Try to extract story text from result_summary too
      const extracted = extractStoryText(
        typeof completeEvent.data.result_summary === 'string' 
          ? completeEvent.data.result_summary 
          : JSON.stringify(completeEvent.data.result_summary),
        'other'
      );
      if (extracted) return extracted;
      return typeof completeEvent.data.result_summary === 'string'
        ? completeEvent.data.result_summary
        : JSON.stringify(completeEvent.data.result_summary, null, 2);
    }
    
    // PRIORITY 6: Fall back to last substantial STORY agent message only (Writer or Polish)
    // Exclude non-story agents like Architect, Worldbuilder, Strategist, etc.
    const storyAgentMessages = messages.filter(
      m => m.type === 'agent_message' && 
           (m.data.agent === 'Writer' || m.data.agent === 'Polish') &&
           m.data.content?.trim()
    );
    if (storyAgentMessages.length > 0) {
      console.log('[finalResult] Using PRIORITY 6: Last story agent message');
      const lastMsg = storyAgentMessages[storyAgentMessages.length - 1];
      const extracted = extractStoryText(lastMsg.data.content || '', 'other');
      if (extracted) return extracted;
      return lastMsg.data.content || '';
    }
    
    console.log('[finalResult] No content found, returning empty string');
    return '';
  }, [messages]);

  // Check for errors
  const generationError = useMemo(() => {
    const errorEvent = messages.find(m => m.type === 'generation_error' || m.type === 'error');
    return errorEvent?.data.error || null;
  }, [messages]);

  if (!runId) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-slate-400">Start a generation to see agent communication</p>
      </div>
    );
  }

  // Get message for display based on selected round
  const getDisplayMessage = (state: AgentState) => {
    if (state.messages.length === 0) return null;
    
    if (selectedRound !== null) {
      const roundMessages = state.messages.filter(m => m.round === selectedRound);
      return roundMessages.length > 0 ? roundMessages[roundMessages.length - 1] : null;
    }
    
    return state.messages[state.messages.length - 1];
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
      <ChatHeader
        currentPhase={currentPhase}
        isConnected={isConnected}
        isComplete={isComplete}
        isCancelled={isCancelled}
        isCancelling={isCancelling}
        isResuming={isResuming}
        onStop={handleStopGeneration}
        onResume={handleResumeGeneration}
        onClose={onClose}
      />

      <RoundSwitcher
        rounds={rounds}
        selectedRound={selectedRound}
        isPlaying={isPlaying}
        onSelectRound={setSelectedRound}
        onTogglePlayback={togglePlayback}
      />

      {/* Motif Layer Planning Status */}
      {(isMotifPlanningActive || motifLayerResult) && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Motif Bible</span>
            {isMotifPlanningActive && (
              <svg className="w-3 h-3 animate-spin text-rose-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
          </div>
          {motifLayerResult ? (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span>{motifLayerResult.core_symbols_count} Core Symbols</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{motifLayerResult.character_motifs_count} Character Motifs</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>{motifLayerResult.scene_targets_count} Scene Targets</span>
              </div>
              {motifLayerResult.has_structural_motifs && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Structural Motifs</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Planning symbolic layer...</div>
          )}
        </div>
      )}

      {/* Deepening Checkpoints Status */}
      {Object.keys(checkpointResults).length > 0 && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Structural Checkpoints</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['inciting_incident', 'midpoint', 'climax', 'resolution'].map(checkpointType => {
              const result = checkpointResults[checkpointType];
              const isActive = activeCheckpoint === checkpointType;
              const isPending = result && result.overall_score === 0;
              const passed = result?.passed;
              const score = result?.overall_score;
              
              return (
                <div
                  key={checkpointType}
                  className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all
                    ${isActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse' : ''}
                    ${!isActive && result && passed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : ''}
                    ${!isActive && result && !passed && !isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''}
                    ${!result ? 'bg-slate-700/50 text-slate-500 border border-slate-600/30' : ''}
                    ${isPending && !isActive ? 'bg-slate-700/50 text-slate-400 border border-slate-600/30' : ''}
                  `}
                  title={result ? `Scene ${result.scene_number}: ${passed ? 'Passed' : 'Needs Revision'} (${score?.toFixed(1)}/10)` : 'Not yet evaluated'}
                >
                  {isActive && (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {!isActive && result && passed && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {!isActive && result && !passed && !isPending && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <span className="capitalize">{checkpointType.replace(/_/g, ' ')}</span>
                  {result && !isPending && (
                    <span className="text-[10px] opacity-75">({score?.toFixed(1)})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diagnostic Analysis Panel (Two-Pass Critic) */}
      {Object.keys(diagnosticResults).length > 0 && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Diagnostic Analysis</span>
            {activeDiagnosticScene && (
              <span className="text-xs text-sky-400 animate-pulse">Analyzing Scene {activeDiagnosticScene}...</span>
            )}
          </div>
          
          <div className="space-y-3">
            {Object.values(diagnosticResults).map(diagnostic => (
              <div key={diagnostic.scene_number} className="rounded-lg overflow-hidden">
                {/* Scene Header */}
                <div className={`px-3 py-2 flex items-center justify-between ${
                  diagnostic.status === 'rubric_scanning' ? 'bg-sky-500/20 border border-sky-500/30' :
                  diagnostic.status === 'analyzing_weakness' ? 'bg-sky-500/20 border border-sky-500/30' :
                  diagnostic.status === 'revision_sent' ? 'bg-amber-500/20 border border-amber-500/30' :
                  'bg-emerald-500/20 border border-emerald-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      diagnostic.status === 'rubric_scanning' || diagnostic.status === 'analyzing_weakness' ? 'text-sky-400' :
                      diagnostic.status === 'revision_sent' ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      Scene {diagnostic.scene_number}
                    </span>
                    {diagnostic.status === 'rubric_scanning' && (
                      <span className="text-[10px] text-sky-300 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Rubric Scan
                      </span>
                    )}
                    {diagnostic.status === 'analyzing_weakness' && (
                      <span className="text-[10px] text-sky-300 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Finding Weakest Link
                      </span>
                    )}
                    {diagnostic.status === 'revision_sent' && (
                      <span className="text-[10px] text-amber-300">Revision Requested</span>
                    )}
                  </div>
                  {diagnostic.rubric && (
                    <span className={`text-xs font-bold ${
                      diagnostic.rubric.overall_score >= 8 ? 'text-emerald-400' :
                      diagnostic.rubric.overall_score >= 6 ? 'text-amber-400' :
                      'text-red-400'
                    }`}>
                      {diagnostic.rubric.overall_score.toFixed(1)}/10
                    </span>
                  )}
                </div>

                {/* Rubric Details */}
                {diagnostic.rubric && (
                  <div className="bg-slate-900/50 px-3 py-2 border-x border-b border-slate-700/50">
                    {/* Dimension Scores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      {Object.entries(diagnostic.rubric.dimensions).map(([dim, score]) => (
                        <div key={dim} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 truncate" title={dim.replace(/_/g, ' ')}>
                            {dim.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase()).join('')}
                          </span>
                          <span className={`font-medium ${
                            score >= 8 ? 'text-emerald-400' :
                            score >= 6 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>{score}</span>
                        </div>
                      ))}
                    </div>

                    {/* Flags */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {diagnostic.rubric.didacticism_detected && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">
                          Didacticism Detected
                        </span>
                      )}
                      {diagnostic.rubric.cliches_found.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {diagnostic.rubric.cliches_found.length} Cliches
                        </span>
                      )}
                    </div>

                    {/* Weakness Candidates */}
                    {diagnostic.rubric.weakness_candidates.length > 0 && (
                      <div className="text-[10px] text-slate-400">
                        <span className="text-slate-500">Weaknesses: </span>
                        {diagnostic.rubric.weakness_candidates.map((w, i) => (
                          <span key={i} className="text-amber-400">
                            {w.dimension.replace(/_/g, ' ')} ({w.score})
                            {i < diagnostic.rubric!.weakness_candidates.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Weakest Link Details */}
                {diagnostic.weakest_link && (
                  <div className={`px-3 py-2 border-x border-b rounded-b-lg ${
                    diagnostic.weakest_link.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                    diagnostic.weakest_link.severity === 'major' ? 'bg-amber-500/10 border-amber-500/30' :
                    'bg-yellow-500/10 border-yellow-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <svg className={`w-3 h-3 ${
                        diagnostic.weakest_link.severity === 'critical' ? 'text-red-400' :
                        diagnostic.weakest_link.severity === 'major' ? 'text-amber-400' :
                        'text-yellow-400'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className={`text-xs font-medium ${
                        diagnostic.weakest_link.severity === 'critical' ? 'text-red-400' :
                        diagnostic.weakest_link.severity === 'major' ? 'text-amber-400' :
                        'text-yellow-400'
                      }`}>
                        {diagnostic.weakest_link.dimension.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        diagnostic.weakest_link.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                        diagnostic.weakest_link.severity === 'major' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {diagnostic.weakest_link.severity}
                      </span>
                    </div>
                    {diagnostic.weakest_link.revision_issues && (
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {diagnostic.weakest_link.revision_issues}
                      </p>
                    )}
                    {diagnostic.weakest_link.evidence && (
                      <p className="text-[10px] text-slate-500 mt-1 italic border-l-2 border-slate-600 pl-2">
                        "{diagnostic.weakest_link.evidence.substring(0, 100)}{diagnostic.weakest_link.evidence.length > 100 ? '...' : ''}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {(error || generationError) && (
        <div className={`border-b px-4 py-3 ${isInterrupted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className={`text-sm ${isInterrupted ? 'text-amber-400' : 'text-red-400'}`}>
                {error || generationError}
              </p>
              {isInterrupted && lastCompletedPhase && (
                <p className="text-xs text-slate-400 mt-1">
                  Last completed phase: <span className="text-amber-300 font-medium">{lastCompletedPhase}</span>
                  {resumeFromPhase && (
                    <span> - Will resume from: <span className="text-emerald-300 font-medium">{resumeFromPhase}</span></span>
                  )}
                </p>
              )}
            </div>
            {isInterrupted && canResume && onResume && (
              <button
                onClick={handleResumeInterrupted}
                disabled={isLoadingResumeState}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isLoadingResumeState ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Resume</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Narrative Possibilities Selector (Branching Mode) */}
      {narrativePossibilities && narrativePossibilities.length > 0 && (
        <div className="p-4">
          <NarrativePossibilitiesSelector
            possibilities={narrativePossibilities}
            recommendation={narrativeRecommendation || undefined}
            onSelect={(possibility) => {
              setIsSelectingNarrative(true);
              if (onNarrativePossibilitySelected) {
                onNarrativePossibilitySelected(possibility);
              }
            }}
            isLoading={isSelectingNarrative}
          />
        </div>
      )}

      {/* Agent Grid */}
      <div className="p-2 sm:p-4" style={{ display: narrativePossibilities && narrativePossibilities.length > 0 ? 'none' : 'block' }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium">Initializing agents...</p>
              <p className="text-sm text-slate-500 mt-1">Preparing the storytelling ensemble</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map(agent => {
              const state = agentStates[agent];
              const color = AGENT_COLORS[agent];
              const borderColor = AGENT_BORDER_COLORS[agent];
              const glowColor = AGENT_GLOW_COLORS[agent];
              const textColor = AGENT_TEXT_COLORS[agent];
              const icon = AGENT_ICONS[agent];
              const description = AGENT_DESCRIPTIONS[agent];
              const isActive = activeAgent === agent && !isCancelled;
              const displayMessage = getDisplayMessage(state);
              const formattedContent = displayMessage ? formatAgentContent(displayMessage.content) : '';
              const isEditing = editState?.agent === agent;
              const isLocked = lockedAgents[agent] || false;
              const hasContent = displayMessage || getAgentContent(agent);
              
              return (
                <div 
                  key={agent}
                  className={`
                    relative rounded-xl overflow-hidden transition-all duration-500
                    ${isActive ? `border-2 ${borderColor} shadow-lg ${glowColor}` : 'border border-slate-700/50'}
                    ${state.status === 'idle' && !hasContent ? 'opacity-40' : 'opacity-100'}
                    ${isLocked ? 'ring-2 ring-amber-500/30' : ''}
                    hover:border-slate-600 hover:shadow-md
                    bg-gradient-to-b from-slate-800/80 to-slate-900/80
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
                  )}
                  
                  {/* Agent Header */}
                  <div className={`px-4 py-3 flex items-center gap-3 border-b border-slate-700/50 ${
                    isActive ? 'bg-slate-800/50' : ''
                  }`}>
                    <div className={`
                      w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0
                      ${isActive ? 'animate-pulse' : ''}
                      shadow-lg
                    `}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${textColor}`}>{agent}</span>
                        {isLocked && (
                          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        {state.status === 'thinking' && !isCancelled && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                        {state.status === 'complete' && !isLocked && (
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{description}</span>
                    </div>
                    
                    {/* Edit and Lock buttons */}
                    {(isComplete || hasContent) && !isEditing && (
                      <div className="flex items-center gap-1">
                        {agent === 'Writer' && (
                          <button
                            onClick={handleOpenSceneModal}
                            className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors"
                            title="Regenerate specific scenes"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleLock(agent)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isLocked 
                              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                          }`}
                          title={isLocked ? 'Unlock agent' : 'Lock agent'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isLocked ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            )}
                          </svg>
                        </button>
                        <button
                          onClick={() => handleStartEdit(agent)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors"
                          title="Edit content"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Agent Content */}
                  <div className="p-4 min-h-[120px] max-h-[300px] overflow-y-auto">
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editState.content}
                          onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                          className="w-full h-40 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                          placeholder="Edit agent content..."
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleApplyEdit}
                            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    ) : !displayMessage && !getAgentContent(agent) ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-slate-500 italic">
                          {isCancelled ? 'Cancelled' : state.status === 'thinking' ? 'Processing...' : 'Awaiting turn...'}
                        </p>
                      </div>
                    ) : (
                      <MarkdownContent 
                        content={formattedContent || (agent === 'Strategist' ? formatStrategistContent(getAgentContent(agent)) : formatAgentContent(getAgentContent(agent)))} 
                        className="text-sm" 
                      />
                    )}
                  </div>
                  
                  {/* Feedback Buttons - show when agent has content */}
                  {hasContent && runId && (
                    <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Rate this output</span>
                      <FeedbackButtons
                        runId={runId}
                        projectId={projectId || ''}
                        agentName={agent}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation Timeline */}
      {messages.filter(m => m.type === 'agent_message' && m.data.content).length > 0 && (
        <div className="border-t border-slate-700">
          <details className="group" open>
            <summary className="bg-slate-800/50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors">
              <svg className="w-5 h-5 text-cyan-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h4 className="font-semibold text-cyan-400">Conversation Timeline</h4>
              <span className="text-xs text-slate-500 ml-auto">
                {(() => {
                  const agentMsgs = messages.filter(m => m.type === 'agent_message' && m.data.content);
                  const filtered = selectedRound !== null 
                    ? agentMsgs.filter(m => m.data.round === selectedRound)
                    : agentMsgs;
                  return `${filtered.length} messages`;
                })()}
              </span>
            </summary>
            
            <div className="p-4 bg-slate-900/30 max-h-[400px] overflow-y-auto">
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700" />
                
                <div className="space-y-4">
                  {messages
                    .filter(m => m.type === 'agent_message' && m.data.content)
                    .filter(m => selectedRound === null || m.data.round === selectedRound)
                    .map((msg, idx) => {
                      const agent = msg.data.agent || 'System';
                      const color = AGENT_COLORS[agent] || AGENT_COLORS.System;
                      const textColor = AGENT_TEXT_COLORS[agent] || AGENT_TEXT_COLORS.System;
                      const content = msg.data.content || '';
                      const round = msg.data.round || 1;
                      
                      return (
                        <div key={msg.id || idx} className="relative flex gap-4 pl-2">
                          <div className={`
                            relative z-10 w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0
                            shadow-lg ring-4 ring-slate-900
                          `}>
                            <span className="text-xs font-bold text-white">{idx + 1}</span>
                          </div>
                          
                          <div className="flex-1 bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`font-semibold ${textColor}`}>{agent}</span>
                              <button
                                onClick={() => setSelectedRound(round)}
                                className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
                              >
                                Round {round}
                              </button>
                              <span className="text-xs text-slate-500 ml-auto">
                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                              </span>
                            </div>
                            <MarkdownContent content={formatAgentContent(content)} className="text-sm" />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      <ResultSection isComplete={isComplete} finalResult={finalResult} />

      {/* Footer */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Run ID: {runId.substring(0, 8)}...</span>
        <span>{messages.length} events</span>
      </div>

      {/* Edit Confirmation Modal */}
      {showConfirmModal && pendingEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Confirm Edit & Regenerate</h3>
              <p className="text-sm text-slate-400 mt-1">
                You edited <span className={AGENT_TEXT_COLORS[pendingEdit.agent]}>{pendingEdit.agent}</span>. 
                This will affect downstream agents.
              </p>
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-300">
                  <strong>Phase-Based Regeneration:</strong> Only phases from <span className="font-semibold">{AGENT_TO_PHASE[pendingEdit.agent] || 'Genesis'}</span> onwards will be regenerated.
                  Previous phases will be preserved from your last run.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {getPhasesToRegenerate(pendingEdit.agent).map((phase, idx) => (
                    <span key={phase} className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {idx > 0 && <span className="mr-1">→</span>}
                      {phase}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Edit Comment */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  What did you change? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full h-24 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  placeholder="Describe your changes so the AI can understand the context..."
                />
              </div>
              
              {/* Dependency Graph */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Agent Dependency Flow
                </label>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {AGENTS.map((agent, idx) => {
                      const isEdited = agent === pendingEdit.agent;
                      const isAffected = AGENT_DEPENDENCIES[pendingEdit.agent as AgentName]?.includes(agent as AgentName);
                      const isLocked = lockedAgents[agent];
                      const willRegenerate = agentsToRegenerate.includes(agent);
                      
                      return (
                        <div key={agent} className="flex items-center gap-2">
                          <div 
                            className={`
                              px-3 py-2 rounded-lg text-sm font-medium transition-all
                              ${isEdited ? 'bg-blue-500/30 border-2 border-blue-500 text-blue-300' : ''}
                              ${isAffected && !isEdited ? (isLocked ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300' : willRegenerate ? 'bg-green-500/20 border border-green-500/50 text-green-300' : 'bg-slate-700 border border-slate-600 text-slate-400') : ''}
                              ${!isEdited && !isAffected ? 'bg-slate-800 border border-slate-700 text-slate-500' : ''}
                            `}
                          >
                            <div className="flex items-center gap-1.5">
                              {isLocked && (
                                <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              )}
                              {isEdited && (
                                <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              )}
                              {agent}
                            </div>
                          </div>
                          {idx < AGENTS.length - 1 && (
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500"></span> Edited
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/50"></span> Will Regenerate
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/50"></span> Locked
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Agents to Regenerate */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Select agents to regenerate
                </label>
                <div className="space-y-2">
                  {AGENTS.filter(agent => agent !== pendingEdit.agent).map(agent => {
                    const isAffected = AGENT_DEPENDENCIES[pendingEdit.agent as AgentName]?.includes(agent as AgentName);
                    const isLocked = lockedAgents[agent];
                    const willRegenerate = agentsToRegenerate.includes(agent);
                    
                    return (
                      <div 
                        key={agent}
                        className={`
                          flex items-center justify-between p-3 rounded-lg border transition-all
                          ${isLocked ? 'bg-amber-500/10 border-amber-500/30' : willRegenerate ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-800/50 border-slate-700'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={willRegenerate}
                            onChange={() => handleToggleAgentRegenerate(agent)}
                            disabled={isLocked}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50 disabled:opacity-50"
                          />
                          <div className={`w-8 h-8 rounded-full ${AGENT_COLORS[agent]} flex items-center justify-center`}>
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={AGENT_ICONS[agent]} />
                            </svg>
                          </div>
                          <div>
                            <span className={`font-medium ${AGENT_TEXT_COLORS[agent]}`}>{agent}</span>
                            <span className="text-xs text-slate-500 ml-2">{AGENT_DESCRIPTIONS[agent]}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAffected && !isLocked && !willRegenerate && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-600/50 text-slate-400">Downstream</span>
                          )}
                          {willRegenerate && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Will Regenerate</span>
                          )}
                          <button
                            onClick={() => handleToggleLock(agent)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isLocked 
                                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                            }`}
                            title={isLocked ? 'Unlock agent' : 'Lock agent'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {isLocked ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRegenerate}
                disabled={!editComment.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scene Selection Modal */}
      {showSceneModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Regenerate Selected Scenes</h3>
              <p className="text-sm text-slate-400 mt-1">
                Select which scenes you want to regenerate. Unselected scenes will be kept as-is.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{sceneCount} scenes available</span>
                <button
                  onClick={handleSelectAllScenes}
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {selectedScenes.length === sceneCount ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: sceneCount }, (_, i) => i + 1).map(sceneNum => (
                  <button
                    key={sceneNum}
                    onClick={() => handleToggleScene(sceneNum)}
                    className={`
                      p-3 rounded-lg border transition-all text-sm font-medium
                      ${selectedScenes.includes(sceneNum)
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                      }
                    `}
                  >
                    Scene {sceneNum}
                  </button>
                ))}
              </div>
              
              {selectedScenes.length > 0 && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <p className="text-xs text-cyan-300">
                    <strong>{selectedScenes.length}</strong> scene{selectedScenes.length !== 1 ? 's' : ''} selected for regeneration.
                    The AI will maintain continuity with adjacent unchanged scenes.
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={handleCancelSceneModal}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSceneRegenerate}
                disabled={selectedScenes.length === 0}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate {selectedScenes.length} Scene{selectedScenes.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
