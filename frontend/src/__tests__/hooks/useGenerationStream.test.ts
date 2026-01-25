import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGenerationStream } from '../../hooks/useGenerationStream'

vi.mock('../../lib/api', () => ({
  getAuthenticatedSSEUrl: vi.fn(() => Promise.resolve('http://localhost/events')),
}))

class MockEventSource {
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 0

  static readonly CLOSED = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static connections: MockEventSource[] = []

  constructor(url: string) {
    this.url = url
    MockEventSource.connections.push(this)
  }

  close() {
    this.readyState = MockEventSource.CLOSED
    const index = MockEventSource.connections.indexOf(this)
    if (index > -1) {
      MockEventSource.connections.splice(index, 1)
    }
  }
}

global.EventSource = MockEventSource as any

describe('useGenerationStream', () => {
  beforeEach(() => {
    MockEventSource.connections = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    MockEventSource.connections.forEach(es => es.close())
  })

  it('should not connect when runId is null', () => {
    const { result } = renderHook(() => useGenerationStream({ runId: null }))

    expect(result.current.isConnected).toBe(false)
    expect(result.current.messages).toEqual([])
    expect(MockEventSource.connections.length).toBe(0)
  })

  it('should connect when runId is provided', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onopen?.()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })
  })

  it('should handle phase_start event', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'phase_start', data: { phase: 'profiling' } })
    }))

    await waitFor(() => {
      expect(result.current.currentPhase).toBe('Profiling')
    })
  })

  it('should handle agent_start event', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'agent_start', data: { agent: 'Architect' } })
    }))

    await waitFor(() => {
      expect(result.current.activeAgent).toBe('Architect')
    })
  })

  it('should handle agent_dialogue event', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_dialogue',
        data: { from: 'Architect', to: 'Profiler', message: 'Hello!', dialogueType: 'direct' }
      })
    }))

    await waitFor(() => {
      expect(result.current.activeAgent).toBe('Architect')
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1)
      expect(result.current.messages[0].type).toBe('agent_dialogue')
    })
  })

  it('should handle agent_complete event', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'agent_start', data: { agent: 'Architect' } })
    }))

    await waitFor(() => {
      expect(result.current.activeAgent).toBe('Architect')
    })

    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'agent_complete', data: { agent: 'Architect' } })
    }))

    await waitFor(() => {
      expect(result.current.activeAgent).toBe(null)
    })
  })

  it('should handle new_developments_collected event', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'new_developments_collected',
        data: {
          developments: [
            { subject: 'Alice', change: 'becomes angry', category: 'char' },
            { subject: 'castle', change: 'is destroyed', category: 'world' }
          ]
        }
      })
    }))

    await waitFor(() => {
      expect(result.current.rawFacts.length).toBe(2)
      expect(result.current.rawFacts[0].subject).toBe('Alice')
      expect(result.current.rawFacts[1].category).toBe('world')
    })
  })

  it('should handle generation_complete event', async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useGenerationStream({
      runId: 'test-run-123',
      onComplete
    }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'generation_complete', data: {} })
    }))

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
      expect(result.current.isConnected).toBe(false)
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('should handle generation_error event', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useGenerationStream({
      runId: 'test-run-123',
      onError
    }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'generation_error', data: { error: 'Test error' } })
    }))

    await waitFor(() => {
      expect(result.current.error).toBe('Test error')
    })

    expect(onError).toHaveBeenCalledWith('Test error')
  })

  it('should deduplicate events by eventId', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]

    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_dialogue',
        eventId: 'event-123',
        data: { from: 'Architect', message: 'First message' }
      })
    }))

    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_dialogue',
        eventId: 'event-123',
        data: { from: 'Architect', message: 'Duplicate message' }
      })
    }))

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1)
    })

    expect(result.current.messages[0].data.message).toBe('First message')
  })

  it('should call onMessage callback', async () => {
    const onMessage = vi.fn()
    renderHook(() => useGenerationStream({
      runId: 'test-run-123',
      onMessage
    }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_dialogue',
        data: { from: 'Architect', message: 'Hello!' }
      })
    }))

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledTimes(1)
    })

    expect(onMessage).toHaveBeenCalledWith({
      type: 'agent_dialogue',
      timestamp: undefined,
      eventId: undefined,
      data: { from: 'Architect', message: 'Hello!' }
    })
  })

  it('should disconnect when disconnect function is called', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onopen?.()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    result.current.disconnect()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
    })

    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })

  it('should close connection on unmount', async () => {
    const { unmount } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]

    unmount()

    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })

  it('should handle legacy agent_thought format', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_thought',
        agent: 'Architect',
        thought: 'Thinking about the world',
        sentiment: 'curious'
      })
    }))

    await waitFor(() => {
      expect(result.current.activeAgent).toBe('Architect')
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1)
    })

    expect(result.current.messages[0].data).toEqual({
      agent: 'Architect',
      thought: 'Thinking about the world',
      sentiment: 'curious'
    })
  })

  it('should handle legacy agent_dialogue format', async () => {
    const { result } = renderHook(() => useGenerationStream({ runId: 'test-run-123' }))

    await waitFor(() => {
      expect(MockEventSource.connections.length).toBe(1)
    })

    const es = MockEventSource.connections[0]
    es.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        type: 'agent_dialogue',
        from: 'Architect',
        to: 'Profiler',
        message: 'How are you?',
        dialogueType: 'direct'
      })
    }))

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1)
    })

    expect(result.current.messages[0].data).toEqual({
      from: 'Architect',
      to: 'Profiler',
      message: 'How are you?',
      dialogueType: 'direct'
    })
  })
})
