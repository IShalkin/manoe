import { useState, useEffect, useCallback } from 'react';

const PROJECTS_STORAGE_KEY = 'manoe_projects';
const PROFILE_ID_KEY = 'manoe_profile_id';

export interface StoredProject {
  id: string;
  name: string;
  seedIdea: string;
  moralCompass: string;
  targetAudience: string;
  themes: string;
  runId: string | null;
  status: 'pending' | 'generating' | 'completed' | 'error';
  result: ProjectResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectResult {
  narrativePossibility?: {
    plot_summary?: string;
    setting_description?: string;
    main_conflict?: string;
    potential_characters?: string[];
    thematic_elements?: string[];
  };
  characters?: unknown[];
  outline?: unknown;
  error?: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getOrCreateProfileId(): string {
  let profileId = localStorage.getItem(PROFILE_ID_KEY);
  if (!profileId) {
    profileId = `profile-${generateId()}`;
    localStorage.setItem(PROFILE_ID_KEY, profileId);
  }
  return profileId;
}

export function useProjects() {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId] = useState(() => getOrCreateProfileId());

  // Load projects from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    console.log('[useProjects] Loading from localStorage:', stored ? `${stored.length} bytes` : 'empty');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Sort by createdAt descending (newest first)
        const sorted = parsed.sort((a: StoredProject, b: StoredProject) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        console.log('[useProjects] Loaded', sorted.length, 'projects');
        setProjects(sorted);
      } catch (e) {
        console.error('[useProjects] Failed to parse projects:', e);
      }
    }
    setLoading(false);
  }, []);

  // Persist projects to localStorage whenever they change (after initial load)
  useEffect(() => {
    if (!loading && projects.length > 0) {
      try {
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        console.log('[useProjects] Saved', projects.length, 'projects to localStorage');
      } catch (e) {
        console.error('[useProjects] Failed to save projects:', e);
      }
    }
  }, [projects, loading]);

  // Create a new project
  const createProject = useCallback((data: {
    name: string;
    seedIdea: string;
    moralCompass: string;
    targetAudience: string;
    themes: string;
  }): StoredProject => {
    const now = new Date().toISOString();
    const newProject: StoredProject = {
      id: generateId(),
      name: data.name || 'Untitled Project',
      seedIdea: data.seedIdea,
      moralCompass: data.moralCompass,
      targetAudience: data.targetAudience,
      themes: data.themes,
      runId: null,
      status: 'pending',
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    
    // Use functional update to avoid stale closure
    setProjects(prev => [newProject, ...prev]);
    console.log('[useProjects] Created project:', newProject.id);
    return newProject;
  }, []);

  // Update a project
  const updateProject = useCallback((id: string, updates: Partial<StoredProject>) => {
    // Use functional update to avoid stale closure
    setProjects(prev => prev.map(p => 
      p.id === id 
        ? { ...p, ...updates, updatedAt: new Date().toISOString() }
        : p
    ));
    console.log('[useProjects] Updated project:', id);
  }, []);

  // Start generation for a project
  const startGeneration = useCallback((projectId: string, runId: string) => {
    updateProject(projectId, {
      runId,
      status: 'generating',
    });
  }, [updateProject]);

  // Complete generation for a project
  const completeGeneration = useCallback((projectId: string, result: ProjectResult) => {
    updateProject(projectId, {
      status: 'completed',
      result,
    });
  }, [updateProject]);

  // Mark generation as failed
  const failGeneration = useCallback((projectId: string, error: string) => {
    updateProject(projectId, {
      status: 'error',
      result: { error },
    });
  }, [updateProject]);

  // Delete a project
  const deleteProject = useCallback((id: string) => {
    // Use functional update to avoid stale closure
    setProjects(prev => prev.filter(p => p.id !== id));
    console.log('[useProjects] Deleted project:', id);
  }, []);

  // Get a project by ID
  const getProject = useCallback((id: string): StoredProject | undefined => {
    return projects.find(p => p.id === id);
  }, [projects]);

  // Get a project by run ID
  const getProjectByRunId = useCallback((runId: string): StoredProject | undefined => {
    return projects.find(p => p.runId === runId);
  }, [projects]);

  return {
    projects,
    loading,
    profileId,
    createProject,
    updateProject,
    startGeneration,
    completeGeneration,
    failGeneration,
    deleteProject,
    getProject,
    getProjectByRunId,
  };
}
