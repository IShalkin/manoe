/**
 * AgentCard - Individual agent display card with status, content, and editing capabilities
 */

import { MarkdownContent } from './MarkdownContent';
import { FeedbackButtons } from '../FeedbackButtons';
import {
  AGENT_COLORS,
  AGENT_BORDER_COLORS,
  AGENT_GLOW_COLORS,
  AGENT_TEXT_COLORS,
  AGENT_ICONS,
  AGENT_DESCRIPTIONS,
} from '../../types/chat';
import type { AgentName, AgentState, EditState } from '../../types/chat';
import { formatAgentContent, formatStrategistContent } from '../../utils/formatting';

interface AgentMessage {
  content: string;
  round: number;
}

export interface AgentCardProps {
  agent: AgentName;
  state: AgentState;
  activeAgent: string | null;
  isCancelled: boolean;
  isComplete: boolean;
  editState: EditState | null;
  isLocked: boolean;
  runId: string | null;
  projectId?: string | undefined;
  getAgentContent: (agent: string) => string;
  getDisplayMessage: (state: AgentState) => AgentMessage | null;
  onStartEdit: (agent: string) => void;
  onCancelEdit: () => void;
  onApplyEdit: () => void;
  onEditContentChange: (content: string) => void;
  onToggleLock: (agent: string) => void;
  onOpenSceneModal?: (() => void) | undefined;
}

export function AgentCard({
  agent,
  state,
  activeAgent,
  isCancelled,
  isComplete,
  editState,
  isLocked,
  runId,
  projectId,
  getAgentContent,
  getDisplayMessage,
  onStartEdit,
  onCancelEdit,
  onApplyEdit,
  onEditContentChange,
  onToggleLock,
  onOpenSceneModal,
}: AgentCardProps) {
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
  const hasContent = displayMessage || getAgentContent(agent);

  return (
    <div 
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
            {agent === 'Writer' && onOpenSceneModal && (
              <button
                onClick={onOpenSceneModal}
                className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors"
                title="Regenerate specific scenes"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onToggleLock(agent)}
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
              onClick={() => onStartEdit(agent)}
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
        {isEditing && editState ? (
          <div className="space-y-3">
            <textarea
              value={editState.content}
              onChange={(e) => onEditContentChange(e.target.value)}
              className="w-full h-40 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              placeholder="Edit agent content..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onApplyEdit}
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
}
