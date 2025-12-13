import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { MoralCompass } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'https://app-ypqheluc.fly.dev';

interface ProjectFormData {
  name: string;
  seedIdea: string;
  moralCompass: MoralCompass;
  targetAudience: string;
  themes: string;
}

interface GeneratedProject {
  name: string;
  content: string;
  createdAt: Date;
}

export function DashboardPage() {
  const { hasAnyApiKey, getAgentConfig, getProviderKey } = useSettings();
  const [showNewProject, setShowNewProject] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    seedIdea: '',
    moralCompass: 'ambiguous',
    targetAudience: '',
    themes: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<GeneratedProject[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    
    // Get the Writer agent's configuration (or use Architect for initial generation)
    const architectConfig = getAgentConfig('architect');
    if (!architectConfig) {
      setError('No agent configuration found. Please configure agents in Settings.');
      setIsGenerating(false);
      return;
    }
    
    const apiKey = getProviderKey(architectConfig.provider);
    if (!apiKey) {
      setError(`No API key found for ${architectConfig.provider}. Please add your API key in Settings.`);
      setIsGenerating(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: architectConfig.provider,
          model: architectConfig.model,
          api_key: apiKey,
          seed_idea: formData.seedIdea,
          moral_compass: formData.moralCompass,
          target_audience: formData.targetAudience || undefined,
          themes: formData.themes || undefined,
          project_name: formData.name,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.content) {
        setGeneratedContent(data.content);
        setProjects(prev => [...prev, {
          name: formData.name || 'Untitled Project',
          content: data.content,
          createdAt: new Date(),
        }]);
        setShowNewProject(false);
        setFormData({
          name: '',
          seedIdea: '',
          moralCompass: 'ambiguous',
          targetAudience: '',
          themes: '',
        });
      } else {
        setError(data.error || 'Failed to generate story. Please try again.');
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!hasAnyApiKey()) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-amber-400 mb-2">No API Keys Configured</h2>
          <p className="text-slate-400 mb-4">
            Please configure at least one LLM provider API key in Settings before creating projects.
          </p>
          <a
            href="/settings"
            className="inline-block bg-amber-500 text-white px-6 py-2 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-400">Create and manage your narrative projects</p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="bg-gradient-to-r from-primary-500 to-accent-500 text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-red-400">Error</h3>
              <p className="text-sm text-slate-400 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {generatedContent && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-green-400">Generated Narrative</h3>
            <button onClick={() => setGeneratedContent(null)} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-slate-300 bg-slate-900/50 p-4 rounded-lg overflow-auto max-h-96">
              {generatedContent}
            </pre>
          </div>
        </div>
      )}

      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Create New Project</h2>
              <button
                onClick={() => { setShowNewProject(false); setError(null); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Epic Story"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Seed Idea (What If?)</label>
                <textarea
                  value={formData.seedIdea}
                  onChange={(e) => setFormData({ ...formData, seedIdea: e.target.value })}
                  placeholder="What if a detective discovered that all the crimes in the city were connected to a single, immortal mastermind?"
                  rows={4}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors resize-none"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Start with "What if..." to spark your narrative
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Moral Compass</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'ethical', label: 'Ethical', desc: 'Virtue, justice, moral clarity' },
                    { value: 'unethical', label: 'Unethical', desc: 'Darkness, taboos, moral ambiguity' },
                    { value: 'amoral', label: 'Amoral', desc: 'Non-judgmental observation' },
                    { value: 'ambiguous', label: 'Ambiguous', desc: 'Complex moral dilemmas' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, moralCompass: option.value as MoralCompass })}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        formData.moralCompass === option.value
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-slate-500">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Target Audience</label>
                <input
                  type="text"
                  value={formData.targetAudience}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  placeholder="Young adults, fans of psychological thrillers"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Core Themes (comma-separated)</label>
                <input
                  type="text"
                  value={formData.themes}
                  onChange={(e) => setFormData({ ...formData, themes: e.target.value })}
                  placeholder="Identity, redemption, the nature of evil"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="flex-1 px-6 py-3 border border-slate-600 rounded-xl hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1 bg-gradient-to-r from-primary-500 to-accent-500 text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project, index) => (
          <div key={index} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-primary-500/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-lg">{project.name}</h3>
              <span className="text-xs text-slate-500">
                {project.createdAt.toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-slate-400 line-clamp-3 mb-4">
              {project.content.substring(0, 150)}...
            </p>
            <button 
              onClick={() => setGeneratedContent(project.content)}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              View Full Narrative
            </button>
          </div>
        ))}
        
        <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-primary-500/50 transition-colors cursor-pointer" onClick={() => setShowNewProject(true)}>
          <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="font-medium text-slate-400">{projects.length === 0 ? 'Create your first project' : 'New Project'}</h3>
          <p className="text-sm text-slate-500 mt-1">Start with a "What If?" idea</p>
        </div>
      </div>
    </div>
  );
}
