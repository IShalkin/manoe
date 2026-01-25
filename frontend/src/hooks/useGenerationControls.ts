/**
 * useGenerationControls - Hook for generation stop/resume functionality
 */

import { useState, useCallback, useEffect } from 'react';
import { orchestratorFetch } from '../lib/api';

export interface UseGenerationControlsProps {
  runId: string | null;
  isComplete: boolean;
  isCancelled: boolean;
  isInterrupted: boolean;
  onReconnect?: () => void;
  onResume?: (runId: string, fromPhase: string) => void;
}

export interface UseGenerationControlsReturn {
  isCancelling: boolean;
  isResuming: boolean;
  canResume: boolean;
  resumeFromPhase: string | null;
  lastCompletedPhase: string | null;
  isLoadingResumeState: boolean;
  localError: string | null;
  handleStopGeneration: () => Promise<void>;
  handleResumeGeneration: () => Promise<void>;
  handleResumeInterrupted: () => Promise<void>;
}

export function useGenerationControls({
  runId,
  isComplete,
  isCancelled,
  isInterrupted,
  onReconnect,
  onResume,
}: UseGenerationControlsProps): UseGenerationControlsReturn {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [resumeFromPhase, setResumeFromPhase] = useState<string | null>(null);
  const [lastCompletedPhase, setLastCompletedPhase] = useState<string | null>(null);
  const [isLoadingResumeState, setIsLoadingResumeState] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset state when runId changes
  useEffect(() => {
    if (runId) {
      setIsCancelling(false);
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
  const handleStopGeneration = useCallback(async () => {
    if (!runId || isCancelling || isComplete) return;
    
    setIsCancelling(true);
    
    try {
      const response = await orchestratorFetch(`/runs/${runId}/pause`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Failed to pause generation');
      }
    } catch (err) {
      console.error('Failed to pause generation:', err);
    } finally {
      setIsCancelling(false);
    }
  }, [runId, isCancelling, isComplete]);

  // Handle resume generation after pause
  const handleResumeGeneration = useCallback(async () => {
    if (!runId || isResuming || !isCancelled) return;
    
    setIsResuming(true);
    
    try {
      const response = await orchestratorFetch(`/runs/${runId}/resume`, {
        method: 'POST',
      });
      
      if (response.ok) {
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
      const response = await orchestratorFetch(`/runs/${runId}/state`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const state = await response.json();
        if (state.can_resume && state.resume_from_phase) {
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

  return {
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
  };
}
