import { memo, useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Position,
  Handle,
  NodeProps,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Agent node colors (matching existing AgentChat colors, avoiding purple per user preference)
const AGENT_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  Writer: {
    bg: 'bg-emerald-900/50',
    border: 'border-emerald-500',
    text: 'text-emerald-400',
    glow: 'shadow-emerald-500/30',
  },
  Critic: {
    bg: 'bg-amber-900/50',
    border: 'border-amber-500',
    text: 'text-amber-400',
    glow: 'shadow-amber-500/30',
  },
  Archivist: {
    bg: 'bg-cyan-900/50',
    border: 'border-cyan-500',
    text: 'text-cyan-400',
    glow: 'shadow-cyan-500/30',
  },
};

// Custom node component for agents
function AgentNode({ data }: NodeProps<{ label: string; isActive: boolean }>) {
  const colors = AGENT_COLORS[data.label] || AGENT_COLORS.Writer;
  const isActive = data.isActive;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 transition-all duration-300
        ${colors.bg} ${colors.border}
        ${isActive ? `shadow-lg ${colors.glow} scale-110` : 'opacity-70'}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex items-center gap-2">
        {isActive && (
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors.text.replace('text-', 'bg-')} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${colors.text.replace('text-', 'bg-')}`} />
          </span>
        )}
        <span className={`font-semibold ${colors.text}`}>{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
}

// CRITICAL: Define nodeTypes OUTSIDE the component to prevent re-renders during streaming
const nodeTypes = {
  agent: memo(AgentNode),
};

// Initial nodes (static positions)
const createNodes = (activeAgent: string | null): Node[] => [
  {
    id: 'writer',
    type: 'agent',
    position: { x: 100, y: 50 },
    data: { label: 'Writer', isActive: activeAgent === 'Writer' },
  },
  {
    id: 'critic',
    type: 'agent',
    position: { x: 100, y: 150 },
    data: { label: 'Critic', isActive: activeAgent === 'Critic' },
  },
  {
    id: 'archivist',
    type: 'agent',
    position: { x: 250, y: 100 },
    data: { label: 'Archivist', isActive: activeAgent === 'Archivist' },
  },
];

// Edges between agents
const initialEdges: Edge[] = [
  {
    id: 'writer-critic',
    source: 'writer',
    target: 'critic',
    animated: true,
    style: { stroke: '#10b981' },
  },
  {
    id: 'critic-writer',
    source: 'critic',
    target: 'writer',
    animated: true,
    style: { stroke: '#f59e0b' },
    type: 'smoothstep',
  },
  {
    id: 'writer-archivist',
    source: 'writer',
    target: 'archivist',
    animated: false,
    style: { stroke: '#06b6d4', strokeDasharray: '5,5' },
    label: 'async',
    labelStyle: { fill: '#94a3b8', fontSize: 10 },
  },
];

interface AgentGraphProps {
  activeAgent: string | null;
  currentPhase: string;
}

export function AgentGraph({ activeAgent, currentPhase }: AgentGraphProps) {
  // Only update nodes when activeAgent changes (not on every token)
  const nodes = useMemo(() => createNodes(activeAgent), [activeAgent]);

  // Call fitView after React Flow initializes to ensure proper viewport calculation
  const onInit = useCallback((instance: ReactFlowInstance) => {
    // Small delay to ensure container has final dimensions
    requestAnimationFrame(() => {
      instance.fitView({ padding: 0.3 });
    });
  }, []);

  return (
    <div className="h-full w-full min-h-[300px] flex flex-col bg-slate-900/50 rounded-lg border border-slate-700">
      {/* Header - fixed height */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-300">Agent Flow</h3>
        <p className="text-xs text-slate-500">{currentPhase || 'Idle'}</p>
      </div>
      {/* React Flow container - flex-1 to fill remaining space */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={initialEdges}
          nodeTypes={nodeTypes}
          onInit={onInit}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
        </ReactFlow>
      </div>
    </div>
  );
}
