/**
 * ConversationTimeline - Displays the conversation history between agents
 */

import { MarkdownContent } from './MarkdownContent';
import { formatAgentContent } from '../../utils/formatting';
import { AGENT_COLORS, AGENT_TEXT_COLORS } from '../../types/chat';
import type { AgentMessage } from '../../types/chat';

export interface ConversationTimelineProps {
  messages: AgentMessage[];
  selectedRound: number | null;
  onSelectRound: (round: number) => void;
}

export function ConversationTimeline({
  messages,
  selectedRound,
  onSelectRound,
}: ConversationTimelineProps) {
  const agentMessages = messages.filter(m => m.type === 'agent_message' && m.data.content);
  
  if (agentMessages.length === 0) {
    return null;
  }

  const filteredMessages = selectedRound !== null 
    ? agentMessages.filter(m => m.data.round === selectedRound)
    : agentMessages;

  return (
    <div className="border-t border-slate-700">
      <details className="group" open>
        <summary className="bg-slate-800/50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors">
          <svg className="w-5 h-5 text-cyan-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h4 className="font-semibold text-cyan-400">Conversation Timeline</h4>
          <span className="text-xs text-slate-500 ml-auto">
            {filteredMessages.length} messages
          </span>
        </summary>
        
        <div className="p-4 bg-slate-900/30 max-h-[400px] overflow-y-auto">
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700" />
            
            <div className="space-y-4">
              {filteredMessages.map((msg, idx) => {
                const agent = msg.data.agent || 'System';
                const color = AGENT_COLORS[agent] ?? AGENT_COLORS['System'];
                const textColor = AGENT_TEXT_COLORS[agent] ?? AGENT_TEXT_COLORS['System'];
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
                          onClick={() => onSelectRound(round)}
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
  );
}
