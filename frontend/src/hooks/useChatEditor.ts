/**
 * useChatEditor - Hook for managing agent editing state and operations
 * Handles edit mode, agent locking, regeneration confirmation, and scene selection
 */

import { useState, useCallback, useEffect } from 'react';
import { AGENTS, AGENT_DEPENDENCIES, normalizeAgentName } from '../types/chat';
import type { AgentName, EditState, AgentMessage } from '../types/chat';
import type { ProjectResult } from './useProjects';

export type { ProjectResult } from './useProjects';

export interface RegenerateParams {
  editComment: string;
  editedAgent: string;
  editedContent: string;
  lockedAgents: Record<string, string>;
  agentsToRegenerate: string[];
  scenesToRegenerate?: number[];
}

export interface UseChatEditorProps {
  runId: string | null;
  messages: AgentMessage[];
  projectResult?: ProjectResult | null;
  onUpdateResult?: (result: ProjectResult) => void;
  onRegenerate?: (params: RegenerateParams) => void;
}

export interface UseChatEditorReturn {
  // Edit state
  editState: EditState | null;
  lockedAgents: Record<string, boolean>;
  pendingEdit: { agent: string; content: string } | null;
  
  // Modal states
  showConfirmModal: boolean;
  editComment: string;
  agentsToRegenerate: string[];
  showSceneModal: boolean;
  selectedScenes: number[];
  sceneCount: number;
  
  // Handlers
  handleStartEdit: (agent: string) => void;
  handleCancelEdit: () => void;
  handleApplyEdit: () => void;
  handleEditContentChange: (content: string) => void;
  handleToggleLock: (agent: string) => void;
  handleToggleAgentRegenerate: (agent: string) => void;
  handleConfirmRegenerate: () => void;
  handleCancelConfirm: () => void;
  setEditComment: (comment: string) => void;
  
  // Scene modal handlers
  handleOpenSceneModal: () => void;
  handleToggleScene: (sceneNumber: number) => void;
  handleSelectAllScenes: () => void;
  handleConfirmSceneRegenerate: () => void;
  handleCancelSceneModal: () => void;
  
  // Utils
  getAgentContent: (agent: string) => string;
  resetEditState: () => void;
}

export function useChatEditor({
  runId,
  messages,
  projectResult,
  onUpdateResult,
  onRegenerate,
}: UseChatEditorProps): UseChatEditorReturn {
  // Edit state
  const [editState, setEditState] = useState<EditState | null>(null);
  const [lockedAgents, setLockedAgents] = useState<Record<string, boolean>>(() => projectResult?.locks || {});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editComment, setEditComment] = useState('');
  const [agentsToRegenerate, setAgentsToRegenerate] = useState<string[]>([]);
  const [pendingEdit, setPendingEdit] = useState<{ agent: string; content: string } | null>(null);
  
  // Scene modal state
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<number[]>([]);
  const [sceneCount, setSceneCount] = useState(0);

  // Sync locked agents from projectResult
  useEffect(() => {
    if (projectResult?.locks) {
      setLockedAgents(projectResult.locks);
    }
  }, [projectResult?.locks]);

  // Reset state when runId changes
  const resetEditState = useCallback(() => {
    setEditState(null);
    setShowConfirmModal(false);
    setEditComment('');
    setAgentsToRegenerate([]);
    setPendingEdit(null);
    setShowSceneModal(false);
    setSelectedScenes([]);
    setSceneCount(0);
  }, []);

  useEffect(() => {
    if (runId) {
      resetEditState();
    }
  }, [runId, resetEditState]);

  // Get agent content from various sources
  const getAgentContent = useCallback((agent: string): string => {
    if (projectResult?.edits?.[agent]) {
      return projectResult.edits[agent].content;
    }
    if (projectResult?.agentOutputs?.[agent]) {
      return projectResult.agentOutputs[agent];
    }
    // Look for agent_message events
    const agentMessages = messages.filter(
      m => m.type === 'agent_message' && normalizeAgentName(m.data.agent as string) === agent && m.data.content?.trim()
    );
    if (agentMessages.length > 0) {
      return agentMessages[agentMessages.length - 1].data.content || '';
    }
    // Look for agent_thought events
    const thoughtMessages = messages.filter(
      m => m.type === 'agent_thought' && normalizeAgentName(m.data.agent as string) === agent && m.data.thought
    );
    if (thoughtMessages.length > 0) {
      return thoughtMessages[thoughtMessages.length - 1].data.thought as string || '';
    }
    return '';
  }, [messages, projectResult]);

  // Edit handlers
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

  const handleEditContentChange = useCallback((content: string) => {
    if (editState) {
      setEditState({ ...editState, content });
    }
  }, [editState]);

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

  // Scene modal handlers
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

  return {
    // Edit state
    editState,
    lockedAgents,
    pendingEdit,
    
    // Modal states
    showConfirmModal,
    editComment,
    agentsToRegenerate,
    showSceneModal,
    selectedScenes,
    sceneCount,
    
    // Handlers
    handleStartEdit,
    handleCancelEdit,
    handleApplyEdit,
    handleEditContentChange,
    handleToggleLock,
    handleToggleAgentRegenerate,
    handleConfirmRegenerate,
    handleCancelConfirm,
    setEditComment,
    
    // Scene modal handlers
    handleOpenSceneModal,
    handleToggleScene,
    handleSelectAllScenes,
    handleConfirmSceneRegenerate,
    handleCancelSceneModal,
    
    // Utils
    getAgentContent,
    resetEditState,
  };
}
