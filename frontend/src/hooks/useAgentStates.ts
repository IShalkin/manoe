/**
 * useAgentStates - Hook for computing agent states from SSE messages
 */

import { useMemo } from 'react';
import { AGENTS, normalizeAgentName } from '../types/chat';
import type { AgentState, AgentMessage } from '../types/chat';

export function useAgentStates(messages: AgentMessage[]): Record<string, AgentState> {
  return useMemo(() => {
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
}

export interface DisplayMessage {
  content: string;
  round: number;
  timestamp?: string;
}

export function getDisplayMessage(
  state: AgentState,
  selectedRound: number | null
): DisplayMessage | null {
  if (state.messages.length === 0) return null;
  
  if (selectedRound !== null) {
    const roundMessages = state.messages.filter(m => m.round === selectedRound);
    return roundMessages.length > 0 ? roundMessages[roundMessages.length - 1] : null;
  }
  
  return state.messages[state.messages.length - 1];
}
