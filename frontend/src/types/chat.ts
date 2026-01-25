export interface AgentMessage {
  id?: string;
  type: string;
  timestamp?: string;
  eventId?: string;
  data: {
    agent?: string;
    message_type?: string;
    content?: string;
    to_agent?: string;
    phase?: string;
    status?: string;
    error?: string;
    result?: Record<string, unknown>;
    result_summary?: string;
    round?: number;
    thought?: string;
    from?: string;
    to?: string;
    sentiment?: string;
    dialogueType?: string;
    sceneNum?: number;
    assembledContent?: string;
    finalContent?: string;
    wordCount?: number;
    polishStatus?: string;
    [key: string]: unknown;  // Allow additional properties
  };
}

export interface GenerationResult {
  narrative_possibility?: Record<string, unknown>;
  story?: string;
  agents?: Record<string, string>;
  error?: string;
}

export interface AgentChatProps {
  // Identification
  runId: string | null;
  projectId?: string;
  
  // SSE Data (from parent via useGenerationStream)
  messages: AgentMessage[];
  isConnected: boolean;
  currentPhase: string;
  activeAgent: string | null;
  isComplete: boolean;
  isCancelled: boolean;
  error: string | null;
  
  // Narrative Possibilities (Branching Mode)
  narrativePossibilities: import('../types').NarrativePossibility[] | null;
  narrativeRecommendation: import('../types').NarrativePossibilitiesRecommendation | null;
  
  // Checkpoints (Deepening Mode)
  checkpointResults: Record<string, CheckpointResult>;
  activeCheckpoint: string | null;
  
  // Motif Layer
  motifLayerResult: MotifLayerResult | null;
  isMotifPlanningActive: boolean;
  
  // Diagnostics (Two-Pass Critic)
  diagnosticResults: Record<number, DiagnosticState>;
  activeDiagnosticScene: number | null;
  
  // Interruption state
  isInterrupted: boolean;
  
  // Project data (for edits/locks)
  projectResult?: import('../hooks/useProjects').ProjectResult | null;
  
  // Callbacks
  // Note: onComplete is handled by useGenerationStream hook, not AgentChat
  onClose?: () => void;
  onUpdateResult?: (result: import('../hooks/useProjects').ProjectResult) => void;
  onRegenerate?: (constraints: RegenerationConstraints) => void;
  onNarrativePossibilitySelected?: (possibility: import('../types').NarrativePossibility) => void;
  onResume?: (previousRunId: string, startFromPhase: string) => void;
  onReconnect?: () => void;
}

export interface RegenerationConstraints {
  editComment: string;
  editedAgent: string;
  editedContent: string;
  lockedAgents: Record<string, string>;
  agentsToRegenerate: string[];
  scenesToRegenerate?: number[];
}

export interface EditState {
  agent: string;
  content: string;
  originalContent: string;
}

export const AGENTS = ['Architect', 'Profiler', 'Narrator', 'Strategist', 'Writer', 'Critic'] as const;

export type AgentName = typeof AGENTS[number];

export const AGENT_DEPENDENCIES: Record<AgentName, AgentName[]> = {
  Architect: ['Profiler', 'Narrator', 'Strategist', 'Writer', 'Critic'],
  Profiler: ['Narrator', 'Strategist', 'Writer', 'Critic'],
  Narrator: ['Strategist', 'Writer', 'Critic'],
  Strategist: ['Writer', 'Critic'],
  Writer: ['Critic'],
  Critic: ['Writer', 'Critic'],
};

export const AGENT_TO_PHASE: Record<string, string> = {
  'Architect': 'Genesis',
  'Profiler': 'Characters',
  'Narrator': 'Narrator Design',
  'Worldbuilder': 'Worldbuilding',
  'Strategist': 'Outlining',
  'Writer': 'Drafting',
  'Critic': 'Drafting',
};

export const PHASE_ORDER = ['Genesis', 'Characters', 'Narrator Design', 'Worldbuilding', 'Outlining', 'Motif Layer', 'Advanced Planning', 'Drafting', 'Polish'];

export const AGENT_COLORS: Record<string, string> = {
  Architect: 'bg-blue-500',
  Profiler: 'bg-cyan-500',
  Narrator: 'bg-indigo-500',
  Strategist: 'bg-green-500',
  Writer: 'bg-amber-500',
  Critic: 'bg-red-500',
  System: 'bg-neutral-500',
};

export const AGENT_BORDER_COLORS: Record<string, string> = {
  Architect: 'border-blue-500/50',
  Profiler: 'border-cyan-500/50',
  Narrator: 'border-indigo-500/50',
  Strategist: 'border-green-500/50',
  Writer: 'border-amber-500/50',
  Critic: 'border-red-500/50',
  System: 'border-neutral-500/50',
};

export const AGENT_GLOW_COLORS: Record<string, string> = {
  Architect: 'shadow-blue-500/20',
  Profiler: 'shadow-cyan-500/20',
  Narrator: 'shadow-indigo-500/20',
  Strategist: 'shadow-green-500/20',
  Writer: 'shadow-amber-500/20',
  Critic: 'shadow-red-500/20',
  System: 'shadow-neutral-500/20',
};

export const AGENT_DESCRIPTIONS: Record<string, string> = {
  Architect: 'Narrative Designer',
  Profiler: 'Character Psychologist',
  Narrator: 'Voice Designer',
  Strategist: 'Plot Engineer',
  Writer: 'Scene Composer',
  Critic: 'Quality Analyst',
};

export const AGENT_TEXT_COLORS: Record<string, string> = {
  Architect: 'text-blue-400',
  Profiler: 'text-cyan-400',
  Narrator: 'text-indigo-400',
  Strategist: 'text-green-400',
  Writer: 'text-amber-400',
  Critic: 'text-red-400',
  System: 'text-neutral-400',
};

export const AGENT_ICONS: Record<string, string> = {
  Architect: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  Profiler: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  Narrator: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  Strategist: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  Writer: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  Critic: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  System: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
};

export interface AgentState {
  status: 'idle' | 'thinking' | 'complete';
  messages: Array<{ content: string; round: number; timestamp: string }>;
  lastUpdate: string;
}

export function normalizeAgentName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (AGENTS.includes(normalized as AgentName)) {
    return normalized;
  }
  return name;
}

export function getPhasesToRegenerate(editedAgent: string): string[] {
  const startPhase = AGENT_TO_PHASE[editedAgent] || 'Genesis';
  const startIndex = PHASE_ORDER.indexOf(startPhase);
  if (startIndex === -1) return PHASE_ORDER;
  return PHASE_ORDER.slice(startIndex);
}

// ============================================
// SSE Event Types (for useGenerationStream)
// ============================================

export interface CheckpointResult {
  checkpoint_type: string;
  scene_number: number;
  passed: boolean;
  overall_score: number;
  criteria_scores?: Record<string, { score: number; feedback: string }>;
}

export interface MotifLayerResult {
  core_symbols_count: number;
  character_motifs_count: number;
  scene_targets_count: number;
  has_structural_motifs: boolean;
}

export interface DiagnosticRubricResult {
  scene_number: number;
  overall_score: number;
  dimensions: Record<string, number>;
  didacticism_detected: boolean;
  cliches_found: string[];
  evidence_quotes: string[];
  weakness_candidates: Array<{ dimension: string; score: number; reason: string }>;
}

export interface DiagnosticWeakestLinkResult {
  scene_number: number;
  weakest_link: string;
  severity: string;
  evidence?: string;
  revision_issues: string;
}

export interface DiagnosticState {
  scene_number: number;
  status: 'rubric_scanning' | 'analyzing_weakness' | 'revision_sent';
  rubric?: {
    overall_score: number;
    dimensions: Record<string, number>;
    didacticism_detected: boolean;
    cliches_found: string[];
    evidence_quotes: string[];
    weakness_candidates: Array<{ dimension: string; score: number; reason: string }>;
  };
  weakest_link?: {
    dimension: string;
    severity: string;
    evidence: string;
    revision_issues: string;
  };
}
