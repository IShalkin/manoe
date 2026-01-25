/**
 * AgentStatusGrid - Grid display of all agents with their statuses
 */

import { AgentCard } from './AgentCard';
import { AGENTS } from '../../types/chat';
import type { AgentName, AgentState, EditState } from '../../types/chat';

interface AgentMessage {
  content: string;
  round: number;
}

export interface AgentStatusGridProps {
  agentStates: Record<string, AgentState>;
  activeAgent: string | null;
  isCancelled: boolean;
  isComplete: boolean;
  editState: EditState | null;
  lockedAgents: Record<string, boolean>;
  runId: string | null;
  projectId?: string;
  messages: unknown[];
  getAgentContent: (agent: string) => string;
  getDisplayMessage: (state: AgentState) => AgentMessage | null;
  onStartEdit: (agent: string) => void;
  onCancelEdit: () => void;
  onApplyEdit: () => void;
  onEditContentChange: (content: string) => void;
  onToggleLock: (agent: string) => void;
  onOpenSceneModal: () => void;
}

export function AgentStatusGrid({
  agentStates,
  activeAgent,
  isCancelled,
  isComplete,
  editState,
  lockedAgents,
  runId,
  projectId,
  messages,
  getAgentContent,
  getDisplayMessage,
  onStartEdit,
  onCancelEdit,
  onApplyEdit,
  onEditContentChange,
  onToggleLock,
  onOpenSceneModal,
}: AgentStatusGridProps) {
  if (messages.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {AGENTS.map(agent => (
        <AgentCard
          key={agent}
          agent={agent as AgentName}
          state={agentStates[agent]}
          activeAgent={activeAgent}
          isCancelled={isCancelled}
          isComplete={isComplete}
          editState={editState}
          isLocked={lockedAgents[agent] || false}
          runId={runId}
          projectId={projectId}
          getAgentContent={getAgentContent}
          getDisplayMessage={getDisplayMessage}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onApplyEdit={onApplyEdit}
          onEditContentChange={onEditContentChange}
          onToggleLock={onToggleLock}
          onOpenSceneModal={agent === 'Writer' ? onOpenSceneModal : undefined}
        />
      ))}
    </div>
  );
}
