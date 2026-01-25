/**
 * useFinalResult - Hook for computing final story result from SSE messages
 * Handles deduplication and priority-based content extraction
 */

import { useMemo } from 'react';
import { extractStoryText } from '../utils/formatting';
import type { AgentMessage } from '../types/chat';

export function useFinalResult(messages: AgentMessage[]): string {
  return useMemo(() => {
    // Helper to deduplicate events by sceneNum, keeping the latest one per scene
    const dedupeBySceneNum = <T extends { data: { sceneNum?: number } }>(events: T[]): T[] => {
      const sceneMap = new Map<number, T>();
      events.forEach(event => {
        const sceneNum = event.data.sceneNum ?? 0;
        sceneMap.set(sceneNum, event); // Later events overwrite earlier ones
      });
      return Array.from(sceneMap.values());
    };

    // PRIORITY 1: Use scene_polish_complete events with finalContent (canonical source of truth)
    const polishCompleteEvents = messages.filter(
      m => m.type === 'scene_polish_complete' && m.data.finalContent
    );
    if (polishCompleteEvents.length > 0) {
      // Deduplicate by scene number, then sort and join
      const dedupedEvents = dedupeBySceneNum(polishCompleteEvents);
      const sortedScenes = dedupedEvents
        .sort((a, b) => (a.data.sceneNum || 0) - (b.data.sceneNum || 0))
        .map(m => m.data.finalContent as string)
        .filter(text => text?.trim());
      
      if (sortedScenes.length > 0) {
        return sortedScenes.join('\n\n---\n\n');
      }
    }

    // PRIORITY 2: Use scene_expand_complete events with assembledContent (for scenes without polish)
    const expandCompleteEvents = messages.filter(
      m => m.type === 'scene_expand_complete' && m.data.assembledContent
    );
    if (expandCompleteEvents.length > 0) {
      // Deduplicate by scene number, then sort and join
      const dedupedEvents = dedupeBySceneNum(expandCompleteEvents);
      const sortedScenes = dedupedEvents
        .sort((a, b) => (a.data.sceneNum || 0) - (b.data.sceneNum || 0))
        .map(m => m.data.assembledContent as string)
        .filter(text => text?.trim());
      
      if (sortedScenes.length > 0) {
        return sortedScenes.join('\n\n---\n\n');
      }
    }

    // PRIORITY 3: Collect Polish agent messages, deduplicate by sceneNum
    const polishMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Polish' && m.data.content?.trim()
    );
    if (polishMessages.length > 0) {
      // Deduplicate by sceneNum - keep only the latest Polish message per scene
      const sceneMap = new Map<number, string>();
      polishMessages.forEach(m => {
        const sceneNum = m.data.sceneNum ?? 0;
        const text = extractStoryText(m.data.content || '', 'Polish');
        if (text.trim()) {
          sceneMap.set(sceneNum, text);
        }
      });
      
      if (sceneMap.size > 0) {
        const sortedScenes = Array.from(sceneMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, text]) => text);
        return sortedScenes.join('\n\n---\n\n');
      }
    }
    
    // PRIORITY 4: Fall back to Writer's messages, deduplicate by sceneNum
    const writerMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
    );
    if (writerMessages.length > 0) {
      // Deduplicate by sceneNum - keep only the latest Writer message per scene
      const sceneMap = new Map<number, string>();
      writerMessages.forEach(m => {
        const sceneNum = m.data.sceneNum ?? 0;
        const text = extractStoryText(m.data.content || '', 'Writer');
        if (text.trim()) {
          sceneMap.set(sceneNum, text);
        }
      });
      
      if (sceneMap.size > 0) {
        const sortedScenes = Array.from(sceneMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, text]) => text);
        return sortedScenes.join('\n\n---\n\n');
      }
    }
    
    // PRIORITY 5: Try generation_complete result_summary as fallback
    const completeEvent = messages.find(m => m.type === 'generation_complete');
    if (completeEvent?.data.result_summary) {
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
    const storyAgentMessages = messages.filter(
      m => m.type === 'agent_message' && 
           (m.data.agent === 'Writer' || m.data.agent === 'Polish') &&
           m.data.content?.trim()
    );
    if (storyAgentMessages.length > 0) {
      const lastMsg = storyAgentMessages[storyAgentMessages.length - 1];
      if (lastMsg) {
        const extracted = extractStoryText(lastMsg.data.content ?? '', 'other');
        if (extracted) return extracted;
        return lastMsg.data.content ?? '';
      }
    }
    
    return '';
  }, [messages]);
}

export function useGenerationError(messages: AgentMessage[]): string | null {
  return useMemo(() => {
    const errorEvent = messages.find(m => m.type === 'generation_error' || m.type === 'error');
    return errorEvent?.data.error || null;
  }, [messages]);
}
