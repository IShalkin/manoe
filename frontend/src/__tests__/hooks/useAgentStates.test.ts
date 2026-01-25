import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AgentMessage, AgentState } from '../../types/chat'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}))

import { useAgentStates, getDisplayMessage } from '../../hooks/useAgentStates'

function createMessage(type: string, data: Record<string, unknown>, timestamp?: string): AgentMessage {
  return { type, timestamp: timestamp ?? new Date().toISOString(), data }
}

describe('useAgentStates', () => {
  describe('initialization', () => {
    it('initializes all agents with idle status', () => {
      const { result } = renderHook(() => useAgentStates([]))
      expect(result.current['Architect']!.status).toBe('idle')
      expect(result.current['Writer']!.status).toBe('idle')
      expect(result.current['Critic']!.status).toBe('idle')
    })

    it('initializes all agents with empty messages', () => {
      const { result } = renderHook(() => useAgentStates([]))
      expect(result.current['Architect']!.messages).toEqual([])
    })
  })

  describe('agent_start events', () => {
    it('sets status to thinking on agent_start', () => {
      const messages = [createMessage('agent_start', { agent: 'Architect' }, '2024-01-01T00:00:00Z')]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Architect']!.status).toBe('thinking')
      expect(result.current['Architect']!.lastUpdate).toBe('2024-01-01T00:00:00Z')
    })

    it('normalizes lowercase agent names', () => {
      const messages = [createMessage('agent_start', { agent: 'architect' })]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Architect']!.status).toBe('thinking')
    })
  })

  describe('agent_complete events', () => {
    it('sets status to complete on agent_complete', () => {
      const messages = [
        createMessage('agent_start', { agent: 'Writer' }),
        createMessage('agent_complete', { agent: 'Writer' }, '2024-01-01T00:01:00Z'),
      ]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Writer']!.status).toBe('complete')
    })
  })

  describe('agent_message events', () => {
    it('adds messages to agent state', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: 'Story content', round: 1 }, '2024-01-01T00:00:00Z'),
      ]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Writer']!.messages).toHaveLength(1)
      expect(result.current['Writer']!.messages[0]?.content).toBe('Story content')
      expect(result.current['Writer']!.messages[0]?.round).toBe(1)
    })

    it('accumulates multiple messages', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: 'First', round: 1 }),
        createMessage('agent_message', { agent: 'Writer', content: 'Second', round: 2 }),
      ]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Writer']!.messages).toHaveLength(2)
    })
  })

  describe('agent_thought events', () => {
    it('handles agent_thought events', () => {
      const messages = [
        createMessage('agent_thought', { agent: 'Architect', thought: 'Thinking about structure' }),
      ]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Architect']!.status).toBe('thinking')
      expect(result.current['Architect']!.messages).toHaveLength(1)
      expect(result.current['Architect']!.messages[0]?.content).toBe('Thinking about structure')
    })
  })

  describe('edge cases', () => {
    it('ignores messages with undefined data', () => {
      const messages = [{ type: 'unknown', timestamp: '', data: undefined } as unknown as AgentMessage]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Architect']!.status).toBe('idle')
    })

    it('ignores unknown agents', () => {
      const messages = [createMessage('agent_start', { agent: 'UnknownAgent' })]
      const { result } = renderHook(() => useAgentStates(messages))
      // All known agents should still be idle
      expect(result.current['Architect']!.status).toBe('idle')
    })

    it('handles from field for agent identification', () => {
      const messages = [createMessage('agent_start', { from: 'Writer' })]
      const { result } = renderHook(() => useAgentStates(messages))
      expect(result.current['Writer']!.status).toBe('thinking')
    })
  })
})

describe('getDisplayMessage', () => {
  const createState = (messages: { content: string; round: number; timestamp: string }[]): AgentState => ({
    status: 'complete',
    messages,
    lastUpdate: '',
  })

  it('returns null for empty messages', () => {
    const state = createState([])
    expect(getDisplayMessage(state, null)).toBeNull()
  })

  it('returns last message when no round selected', () => {
    const state = createState([
      { content: 'First', round: 1, timestamp: '' },
      { content: 'Last', round: 2, timestamp: '' },
    ])
    expect(getDisplayMessage(state, null)?.content).toBe('Last')
  })

  it('returns last message for selected round', () => {
    const state = createState([
      { content: 'Round 1 - First', round: 1, timestamp: '' },
      { content: 'Round 1 - Last', round: 1, timestamp: '' },
      { content: 'Round 2', round: 2, timestamp: '' },
    ])
    expect(getDisplayMessage(state, 1)?.content).toBe('Round 1 - Last')
  })

  it('returns null when selected round has no messages', () => {
    const state = createState([
      { content: 'Round 1', round: 1, timestamp: '' },
    ])
    expect(getDisplayMessage(state, 3)).toBeNull()
  })
})
