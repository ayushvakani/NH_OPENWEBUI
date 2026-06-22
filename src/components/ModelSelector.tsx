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
  { id: 'llama3.1:latest', name: 'Llama 3.1 (8B)', description: 'General / Reasoning', category: 'General', color: 'from-blue-500 to-cyan-600' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 (3B)', description: 'Fast / General', category: 'General', color: 'from-blue-500 to-cyan-600' },
  { id: 'qwen2:7b', name: 'Qwen 2 (7B)', description: 'General / Chat', category: 'General', color: 'from-purple-500 to-pink-600' },
  { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder', description: 'Advanced Coding', category: 'Coding', color: 'from-green-500 to-emerald-600' },
  { id: 'gemma3:270m', name: 'Gemma 3 (Tiny)', description: 'Lightning Fast', category: 'General', color: 'from-blue-500 to-cyan-600' },
];

interface Model {
  id: number | string;
  name: string;
  description: string | null;
  category?: string;
  color?: string;
  is_default?: number;
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

export const ModelSelector = ({ selectedModel, onModelChange, disabled }: ModelSelectorProps) => {
  const [models, setModels] = useState<Model[]>(fallbackModels);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await apiFetch<Array<{id: number; name: string; description: string | null; is_default: number}>>('/models/enabled');
        if (data && data.length > 0) {
          const formattedModels = data.map(model => {
            const { category, color } = categorizeModel(model.name);
            return {
              id: model.name, // Use name as id for selection
              name: model.name,
              description: model.description || category,
              category,
              color,
              is_default: model.is_default
            };
          });
          setModels(formattedModels);
          
          // If current selection is not in the list, select the default or first model
          if (!formattedModels.some(m => m.id === selectedModel)) {
            const defaultModel = formattedModels.find(m => m.is_default === 1);
            const modelToSelect = defaultModel || formattedModels[0];
            if (modelToSelect) {
              onModelChange(modelToSelect.id as string);
            }
          }
        } else {
          setModels(fallbackModels);
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

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 font-medium">Model:</span>
        <div className="w-[220px] h-10 bg-slate-900 border border-[#A259FF] rounded-xl animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-400 font-medium">Model:</span>
      <Select value={selectedModel} onValueChange={onModelChange} disabled={disabled}>
        <SelectTrigger className="w-[220px] bg-slate-900 border-[#A259FF] text-white hover:bg-[#6C47FF]/10 transition-all duration-200 shadow-lg rounded-xl">
          <SelectValue>
            <div className="flex items-center gap-3">
              <Badge 
                variant="outline" 
                className={`text-xs bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white border-0`}
              >
                {currentModel?.category}
              </Badge>
              <span className="font-medium">{currentModel?.name}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-[#A259FF] shadow-2xl rounded-xl max-h-[500px] overflow-y-auto">
          {models.map((model) => (
            <SelectItem 
              key={model.id} 
              value={model.id as string}
              className="text-white hover:bg-[#6C47FF]/20 focus:bg-[#A259FF]/20 cursor-pointer rounded-xl"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="outline" 
                    className={`text-xs bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white border-0`}
                  >
                    {model.category}
                  </Badge>
                  <span className="font-medium">{model.name}</span>
                </div>
                <span className="text-xs text-slate-400 ml-3">{model.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
