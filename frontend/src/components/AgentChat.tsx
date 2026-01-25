import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { NarrativePossibilitiesSelector } from './NarrativePossibilitiesSelector';
import { ChatHeader } from './chat/ChatHeader';
import { RoundSwitcher } from './chat/RoundSwitcher';
import { ResultSection } from './chat/ResultSection';
import { ConversationTimeline } from './chat/ConversationTimeline';
import { EditConfirmModal } from './chat/EditConfirmModal';
import { SceneSelectModal } from './chat/SceneSelectModal';
import { AgentStatusGrid } from './chat/AgentStatusGrid';
import { MotifLayerPanel } from './chat/MotifLayerPanel';
import { CheckpointsPanel } from './chat/CheckpointsPanel';
import { DiagnosticPanel } from './chat/DiagnosticPanel';
import { ErrorDisplay } from './chat/ErrorDisplay';
import { useChatEditor } from '../hooks/useChatEditor';
import { useFinalResult, useGenerationError } from '../hooks/useFinalResult';
import { useGenerationControls } from '../hooks/useGenerationControls';
import { useAgentStates, getDisplayMessage } from '../hooks/useAgentStates';
import type { AgentChatProps } from '../types/chat';

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
  // Local UI state
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [isSelectingNarrative, setIsSelectingNarrative] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Generation controls hook
  const {
    isCancelling,
    isResuming,
    canResume,
    resumeFromPhase,
    lastCompletedPhase,
    isLoadingResumeState,
    localError,
    handleStopGeneration,
    handleResumeGeneration,
    handleResumeInterrupted,
  } = useGenerationControls({
    runId,
    isComplete,
    isCancelled,
    isInterrupted,
    onReconnect,
    onResume,
  });

  // Edit state and handlers from hook
  const {
    editState,
    lockedAgents,
    pendingEdit,
    showConfirmModal,
    editComment,
    agentsToRegenerate,
    showSceneModal,
    selectedScenes,
    sceneCount,
    handleStartEdit,
    handleCancelEdit,
    handleApplyEdit,
    handleEditContentChange,
    handleToggleLock,
    handleToggleAgentRegenerate,
    handleConfirmRegenerate,
    handleCancelConfirm,
    setEditComment,
    handleOpenSceneModal,
    handleToggleScene,
    handleSelectAllScenes,
    handleConfirmSceneRegenerate,
    handleCancelSceneModal,
    getAgentContent,
  } = useChatEditor({
    runId,
    messages,
    projectResult,
    onUpdateResult,
    onRegenerate,
  });

  // Combine SSE error and local error
  const error = sseError || localError;

  // Reset playback state when runId changes
  useEffect(() => {
    if (runId) {
      setSelectedRound(null);
      setIsPlaying(false);
    }
  }, [runId]);

  // Compute available rounds from messages
  const rounds = useMemo(() => {
    const roundSet = new Set<number>();
    messages.forEach(msg => {
      if (msg.type === 'agent_message' && msg.data.content) {
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
          const nextRound = rounds[nextIdx];
          return nextRound ?? null;
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
  const agentStates = useAgentStates(messages);

  // Extract final result from messages
  const finalResult = useFinalResult(messages);

  // Check for errors
  const generationError = useGenerationError(messages);

  // Get message for display based on selected round
  const getDisplayMessageForState = useCallback(
    (state: typeof agentStates[string]) => getDisplayMessage(state, selectedRound),
    [selectedRound]
  );

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

      <MotifLayerPanel
        motifLayerResult={motifLayerResult}
        isMotifPlanningActive={isMotifPlanningActive}
      />

      <CheckpointsPanel
        checkpointResults={checkpointResults}
        activeCheckpoint={activeCheckpoint}
      />

      <DiagnosticPanel
        diagnosticResults={diagnosticResults}
        activeDiagnosticScene={activeDiagnosticScene}
      />

      <ErrorDisplay
        error={error}
        generationError={generationError}
        isInterrupted={isInterrupted}
        lastCompletedPhase={lastCompletedPhase}
        resumeFromPhase={resumeFromPhase}
        canResume={canResume}
        isLoadingResumeState={isLoadingResumeState}
        onResume={onResume}
        onResumeInterrupted={handleResumeInterrupted}
      />

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
        <AgentStatusGrid
          agentStates={agentStates}
          activeAgent={activeAgent}
          isCancelled={isCancelled}
          isComplete={isComplete}
          editState={editState}
          lockedAgents={lockedAgents}
          runId={runId}
          projectId={projectId}
          messages={messages}
          getAgentContent={getAgentContent}
          getDisplayMessage={getDisplayMessageForState}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onApplyEdit={handleApplyEdit}
          onEditContentChange={handleEditContentChange}
          onToggleLock={handleToggleLock}
          onOpenSceneModal={handleOpenSceneModal}
        />
      </div>

      <ConversationTimeline
        messages={messages}
        selectedRound={selectedRound}
        onSelectRound={setSelectedRound}
      />

      <ResultSection isComplete={isComplete} finalResult={finalResult} />

      {/* Footer */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Run ID: {runId.substring(0, 8)}...</span>
        <span>{messages.length} events</span>
      </div>

      {showConfirmModal && pendingEdit && (
        <EditConfirmModal
          pendingEdit={pendingEdit}
          editComment={editComment}
          agentsToRegenerate={agentsToRegenerate}
          lockedAgents={lockedAgents}
          onEditCommentChange={setEditComment}
          onToggleAgentRegenerate={handleToggleAgentRegenerate}
          onToggleLock={handleToggleLock}
          onConfirm={handleConfirmRegenerate}
          onCancel={handleCancelConfirm}
        />
      )}

      {showSceneModal && (
        <SceneSelectModal
          sceneCount={sceneCount}
          selectedScenes={selectedScenes}
          onToggleScene={handleToggleScene}
          onSelectAll={handleSelectAllScenes}
          onConfirm={handleConfirmSceneRegenerate}
          onCancel={handleCancelSceneModal}
        />
      )}
    </div>
  );
}
