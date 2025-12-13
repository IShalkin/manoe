import { useState, useEffect, useRef } from 'react';

interface AgentMessage {
  id: string;
  type: string;
  timestamp: string;
  data: {
    agent?: string;
    message_type?: string;
    content?: string;
    to_agent?: string;
    phase?: string;
    status?: string;
    error?: string;
  };
}

interface AgentChatProps {
  runId: string | null;
  orchestratorUrl: string;
  onClose?: () => void;
}

const AGENT_COLORS: Record<string, string> = {
  Architect: 'bg-blue-500',
  Profiler: 'bg-purple-500',
  Strategist: 'bg-green-500',
  Writer: 'bg-amber-500',
  Critic: 'bg-red-500',
  System: 'bg-slate-500',
};

const AGENT_ICONS: Record<string, string> = {
  Architect: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  Profiler: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  Strategist: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  Writer: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  Critic: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  System: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
};

export function AgentChat({ runId, orchestratorUrl, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('Initializing');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Connect to SSE endpoint
    const eventSource = new EventSource(`${orchestratorUrl}/runs/${runId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        
        // Update current phase
        if (data.type === 'phase_start' && data.data.phase) {
          setCurrentPhase(data.data.phase.charAt(0).toUpperCase() + data.data.phase.slice(1));
        }
        
        // Add message to list
        setMessages((prev) => [...prev, data]);
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost. Reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, [runId, orchestratorUrl]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const renderMessage = (msg: AgentMessage) => {
    const { type, data, timestamp } = msg;
    const agent = data.agent || 'System';
    const color = AGENT_COLORS[agent] || AGENT_COLORS.System;
    const icon = AGENT_ICONS[agent] || AGENT_ICONS.System;

    // Skip heartbeat messages
    if (type === 'heartbeat') return null;

    // Render different message types
    if (type === 'agent_message') {
      const content = data.content || '';
      const toAgent = data.to_agent;
      
      return (
        <div key={msg.id} className="flex gap-3 p-3 hover:bg-slate-800/30 rounded-lg transition-colors">
          <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-white">{agent}</span>
              {toAgent && (
                <>
                  <span className="text-slate-500">to</span>
                  <span className="font-medium text-slate-300">{toAgent}</span>
                </>
              )}
              <span className="text-xs text-slate-500 ml-auto">{formatTimestamp(timestamp)}</span>
            </div>
            <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
              {content.length > 500 ? (
                <details>
                  <summary className="cursor-pointer text-primary-400 hover:text-primary-300">
                    {content.substring(0, 200)}... (click to expand)
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-900/50 rounded text-xs overflow-auto max-h-96">
                    {content}
                  </pre>
                </details>
              ) : (
                content
              )}
            </div>
          </div>
        </div>
      );
    }

    if (type === 'agent_start') {
      return (
        <div key={msg.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
          <div className={`w-2 h-2 rounded-full ${color} animate-pulse`} />
          <span>{agent} is thinking...</span>
          <span className="text-xs text-slate-500 ml-auto">{formatTimestamp(timestamp)}</span>
        </div>
      );
    }

    if (type === 'phase_start') {
      return (
        <div key={msg.id} className="flex items-center justify-center py-4">
          <div className="bg-gradient-to-r from-primary-500/20 to-accent-500/20 border border-primary-500/30 rounded-full px-4 py-1">
            <span className="text-sm font-medium text-primary-400">
              Phase: {data.phase?.charAt(0).toUpperCase()}{data.phase?.slice(1)}
            </span>
          </div>
        </div>
      );
    }

    if (type === 'generation_start') {
      return (
        <div key={msg.id} className="flex items-center justify-center py-4">
          <div className="bg-green-500/20 border border-green-500/30 rounded-full px-4 py-1">
            <span className="text-sm font-medium text-green-400">
              Generation Started
            </span>
          </div>
        </div>
      );
    }

    if (type === 'generation_complete') {
      return (
        <div key={msg.id} className="flex items-center justify-center py-4">
          <div className="bg-green-500/20 border border-green-500/30 rounded-full px-4 py-1">
            <span className="text-sm font-medium text-green-400">
              Generation Complete
            </span>
          </div>
        </div>
      );
    }

    if (type === 'generation_error' || type === 'error') {
      return (
        <div key={msg.id} className="flex items-center justify-center py-4">
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-red-400">
              Error: {data.error || 'Unknown error'}
            </span>
          </div>
        </div>
      );
    }

    // Default: show raw event
    return (
      <div key={msg.id} className="px-3 py-1 text-xs text-slate-500">
        [{type}] {JSON.stringify(data).substring(0, 100)}...
      </div>
    );
  };

  if (!runId) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
        <p className="text-slate-400">Start a generation to see agent communication</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="bg-slate-900/50 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Agent Communication</h3>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Phase: {currentPhase}</span>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Agent Legend */}
      <div className="bg-slate-900/30 border-b border-slate-700 px-4 py-2 flex items-center gap-4 flex-wrap">
        {Object.entries(AGENT_COLORS).filter(([name]) => name !== 'System').map(([name, color]) => (
          <div key={name} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-xs text-slate-400">{name}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 m-2">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-slate-400">Waiting for agents...</p>
            </div>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Run ID: {runId.substring(0, 8)}...</span>
        <span>{messages.length} events</span>
      </div>
    </div>
  );
}
