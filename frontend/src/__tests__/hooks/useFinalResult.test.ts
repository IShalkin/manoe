import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AgentMessage } from '../../types/chat'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}))

// Mock extractStoryText to return content as-is for testing
vi.mock('../../utils/formatting', () => ({
  extractStoryText: (content: string) => content,
}))

import { useFinalResult, useGenerationError } from '../../hooks/useFinalResult'

function createMessage(type: string, data: Record<string, unknown>): AgentMessage {
  return { type, timestamp: new Date().toISOString(), data }
}

describe('useFinalResult', () => {
  describe('priority 1: scene_polish_complete', () => {
    it('returns finalContent from scene_polish_complete events', () => {
      const messages = [
        createMessage('scene_polish_complete', { finalContent: 'Scene 1', sceneNum: 1 }),
        createMessage('scene_polish_complete', { finalContent: 'Scene 2', sceneNum: 2 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Scene 1\n\n---\n\nScene 2')
    })

    it('deduplicates by sceneNum keeping latest', () => {
      const messages = [
        createMessage('scene_polish_complete', { finalContent: 'Old Scene 1', sceneNum: 1 }),
        createMessage('scene_polish_complete', { finalContent: 'New Scene 1', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('New Scene 1')
    })

    it('sorts scenes by sceneNum', () => {
      const messages = [
        createMessage('scene_polish_complete', { finalContent: 'Scene 3', sceneNum: 3 }),
        createMessage('scene_polish_complete', { finalContent: 'Scene 1', sceneNum: 1 }),
        createMessage('scene_polish_complete', { finalContent: 'Scene 2', sceneNum: 2 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Scene 1\n\n---\n\nScene 2\n\n---\n\nScene 3')
    })
  })

  describe('priority 2: scene_expand_complete', () => {
    it('uses assembledContent when no polish events', () => {
      const messages = [
        createMessage('scene_expand_complete', { assembledContent: 'Expanded 1', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Expanded 1')
    })

    it('prefers scene_polish_complete over scene_expand_complete', () => {
      const messages = [
        createMessage('scene_expand_complete', { assembledContent: 'Expanded', sceneNum: 1 }),
        createMessage('scene_polish_complete', { finalContent: 'Polished', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Polished')
    })
  })

  describe('priority 3: Polish agent messages', () => {
    it('uses Polish agent messages when no scene events', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Polish', content: 'Polish content', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Polish content')
    })
  })

  describe('priority 4: Writer agent messages', () => {
    it('uses Writer messages when no Polish messages', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: 'Writer content', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Writer content')
    })

    it('deduplicates Writer messages by sceneNum', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: 'Old', sceneNum: 1 }),
        createMessage('agent_message', { agent: 'Writer', content: 'New', sceneNum: 1 }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('New')
    })
  })

  describe('priority 5: generation_complete', () => {
    it('uses result_summary from generation_complete', () => {
      const messages = [
        createMessage('generation_complete', { result_summary: 'Complete summary' }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('Complete summary')
    })
  })

  describe('priority 6: fallback to last agent message', () => {
    it('falls back to last Writer/Polish message', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: 'First' }),
        createMessage('agent_message', { agent: 'Writer', content: 'Last' }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      // With no sceneNum, all messages have sceneNum 0, so last one wins
      expect(result.current).toBe('Last')
    })

    it('ignores non-story agent messages', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Architect', content: 'Architect stuff' }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('')
    })
  })

  describe('empty cases', () => {
    it('returns empty string for no messages', () => {
      const { result } = renderHook(() => useFinalResult([]))
      expect(result.current).toBe('')
    })

    it('returns empty string for messages without content', () => {
      const messages = [
        createMessage('agent_message', { agent: 'Writer', content: '' }),
      ]
      const { result } = renderHook(() => useFinalResult(messages))
      expect(result.current).toBe('')
    })
  })
})

describe('useGenerationError', () => {
  it('returns null when no error events', () => {
    const messages = [
      createMessage('agent_message', { agent: 'Writer', content: 'Content' }),
    ]
    const { result } = renderHook(() => useGenerationError(messages))
    expect(result.current).toBeNull()
  })

  it('returns error from generation_error event', () => {
    const messages = [
      createMessage('generation_error', { error: 'Something went wrong' }),
    ]
    const { result } = renderHook(() => useGenerationError(messages))
    expect(result.current).toBe('Something went wrong')
  })

  it('returns error from error event', () => {
    const messages = [
      createMessage('error', { error: 'Generic error' }),
    ]
    const { result } = renderHook(() => useGenerationError(messages))
    expect(result.current).toBe('Generic error')
  })
})
