/**
 * EditConfirmModal - Modal for confirming agent edits and regeneration
 */

import {
  AGENTS,
  AGENT_DEPENDENCIES,
  AGENT_TO_PHASE,
  AGENT_COLORS,
  AGENT_TEXT_COLORS,
  AGENT_DESCRIPTIONS,
  AGENT_ICONS,
  getPhasesToRegenerate,
} from '../../types/chat';
import type { AgentName } from '../../types/chat';

export interface EditConfirmModalProps {
  pendingEdit: { agent: string; content: string };
  editComment: string;
  agentsToRegenerate: string[];
  lockedAgents: Record<string, boolean>;
  onEditCommentChange: (comment: string) => void;
  onToggleAgentRegenerate: (agent: string) => void;
  onToggleLock: (agent: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EditConfirmModal({
  pendingEdit,
  editComment,
  agentsToRegenerate,
  lockedAgents,
  onEditCommentChange,
  onToggleAgentRegenerate,
  onToggleLock,
  onConfirm,
  onCancel,
}: EditConfirmModalProps) {
  return (
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
              onChange={(e) => onEditCommentChange(e.target.value)}
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
                        onChange={() => onToggleAgentRegenerate(agent)}
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
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
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
  );
}
