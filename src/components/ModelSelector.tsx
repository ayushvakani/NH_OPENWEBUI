import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

// Fallback models in case API fails
export const fallbackModels = [
  { id: 'llama3.1:latest', name: 'Llama 3.1 (8B)', description: 'General / Reasoning', category: 'General', color: 'from-blue-500 to-cyan-600', source: 'ollama' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 (3B)', description: 'Fast / General', category: 'General', color: 'from-blue-500 to-cyan-600', source: 'ollama' },
  { id: 'qwen2:7b', name: 'Qwen 2 (7B)', description: 'General / Chat', category: 'General', color: 'from-purple-500 to-pink-600', source: 'ollama' },
  { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder', description: 'Advanced Coding', category: 'Coding', color: 'from-green-500 to-emerald-600', source: 'ollama' },
  { id: 'gemma3:270m', name: 'Gemma 3 (Tiny)', description: 'Lightning Fast', category: 'General', color: 'from-blue-500 to-cyan-600', source: 'ollama' },
];

interface Model {
  id: number | string;
  name: string;
  description: string | null;
  category?: string;
  color?: string;
  is_default?: number;
  source?: 'ollama' | 'openwebui';
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

// Helper function to categorize models
const categorizeModel = (modelName: string): { category: string; color: string } => {
  const name = modelName.toLowerCase();
  if (name.includes('deepseek') || name.includes('coder') || name.includes('codellama')) {
    return { category: 'Coding', color: 'from-green-500 to-emerald-600' };
  } else if (name.includes('vl') || name.includes('vision') || name.includes('qwen2.5vl')) {
    return { category: 'Multimodal', color: 'from-purple-500 to-pink-600' };
  } else if (name.includes('embed')) {
    return { category: 'Embedding', color: 'from-orange-500 to-red-600' };
  } else {
    return { category: 'General', color: 'from-blue-500 to-cyan-600' };
  }
};

export const models = fallbackModels; // Export for backward compatibility

const SOURCE_BADGE_STYLES: Record<string, string> = {
  ollama: 'bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white border-0',
  openwebui: 'bg-gradient-to-r from-[#0ea5e9] to-[#6366f1] text-white border-0',
};

const SOURCE_SECTION_LABEL: Record<string, string> = {
  ollama: '⚡ Local Ollama',
  openwebui: '🌐 OpenWebUI',
};

export const ModelSelector = ({ selectedModel, onModelChange, disabled }: ModelSelectorProps) => {
  const [models, setModels] = useState<Model[]>(fallbackModels);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        // Fetch local Ollama models
        const ollamaData = await apiFetch<Array<{ id: number; name: string; description: string | null; is_default: number }>>('/models/enabled');
        
        let ollamaModels: Model[] = [];
        if (ollamaData && ollamaData.length > 0) {
          ollamaModels = ollamaData.map(model => {
            const { category, color } = categorizeModel(model.name);
            return {
              id: model.name,
              name: model.name,
              description: model.description || category,
              category,
              color,
              is_default: model.is_default,
              source: 'ollama' as const
            };
          });
        } else {
          ollamaModels = fallbackModels;
        }

        // Fetch OpenWebUI models (non-blocking — if it fails, still show Ollama models)
        let owuiModels: Model[] = [];
        try {
          const owuiData = await apiFetch<Array<{
            id: string;
            name: string;
            description: string;
            category: string;
            source: string;
          }>>('/models/openwebui');
          
          if (owuiData && owuiData.length > 0) {
            owuiModels = owuiData.map(m => ({
              id: m.id,
              name: m.name,
              description: m.description || m.category,
              category: m.category,
              color: 'from-sky-500 to-indigo-600',
              source: 'openwebui' as const
            }));
          }
        } catch (owuiErr) {
          console.warn('OpenWebUI models unavailable (this is OK if OpenWebUI is not running):', owuiErr);
        }

        const allModels = [...ollamaModels, ...owuiModels];
        setModels(allModels);

        // If current selection is not in the list, select the default or first model
        if (!allModels.some(m => m.id === selectedModel)) {
          const defaultModel = ollamaModels.find(m => m.is_default === 1);
          const modelToSelect = defaultModel || allModels[0];
          if (modelToSelect) {
            onModelChange(modelToSelect.id as string);
          }
        }
      } catch (error) {
        console.error('Failed to fetch models, using fallback:', error);
        setModels(fallbackModels);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const currentModel = models.find(model => model.id === selectedModel);
  const modelSource = currentModel?.source || 'ollama';

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 font-medium">Model:</span>
        <div className="w-[260px] h-10 bg-slate-900 border border-[#A259FF] rounded-xl animate-pulse"></div>
      </div>
    );
  }

  // Group models by source for display
  const ollamaModels = models.filter(m => m.source === 'ollama' || !m.source);
  const owuiModels = models.filter(m => m.source === 'openwebui');

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-400 font-medium">Model:</span>
      <Select value={selectedModel} onValueChange={onModelChange} disabled={disabled}>
        <SelectTrigger className="w-[260px] bg-slate-900 border-[#A259FF] text-white hover:bg-[#6C47FF]/10 transition-all duration-200 shadow-lg rounded-xl">
          <SelectValue>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${SOURCE_BADGE_STYLES[modelSource] || SOURCE_BADGE_STYLES.ollama}`}
              >
                {currentModel?.category || 'General'}
              </Badge>
              {modelSource === 'openwebui' && (
                <Badge variant="outline" className="text-xs bg-sky-900/60 text-sky-300 border-sky-700/50 text-[10px] px-1">
                  🌐
                </Badge>
              )}
              <span className="font-medium truncate">{currentModel?.name}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-[#A259FF] shadow-2xl rounded-xl max-h-[500px] overflow-y-auto">
          
          {/* Local Ollama Section */}
          {ollamaModels.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-purple-400 uppercase tracking-wider border-b border-slate-800">
                ⚡ Local Ollama Models
              </div>
              {ollamaModels.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id as string}
                  className="text-white hover:bg-[#6C47FF]/20 focus:bg-[#A259FF]/20 cursor-pointer rounded-xl"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-xs bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white border-0"
                      >
                        {model.category}
                      </Badge>
                      <span className="font-medium">{model.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 ml-3">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {/* OpenWebUI Section */}
          {owuiModels.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-sky-400 uppercase tracking-wider border-b border-slate-800 mt-1">
                🌐 OpenWebUI Models
              </div>
              {owuiModels.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id as string}
                  className="text-white hover:bg-sky-900/20 focus:bg-sky-900/30 cursor-pointer rounded-xl"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-xs bg-gradient-to-r from-[#0ea5e9] to-[#6366f1] text-white border-0"
                      >
                        {model.category}
                      </Badge>
                      <span className="font-medium">{model.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 ml-3">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {owuiModels.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500 italic">
              OpenWebUI not available (start it to see more models)
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
};
