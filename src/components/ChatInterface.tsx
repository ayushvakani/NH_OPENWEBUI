 import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Link2, Paperclip, Image, FileText, AlertCircle, Settings, Mic, Database, BarChart3, Upload, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ModelSelector } from '@/components/ModelSelector';
import { CopyButton } from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiService, chainModelsAPI, uploadFilesAPI, searchYouTubeAPI, searchRedditAPI, searchAcademicAPI, searchCryptoAPI, getChatHistoryAPI, saveChatMessageAPI, askModelStream, chainModelsStream, askModelStreamWithSearch, apiFetch, getOCRLanguagesAPI, performOCRAPI, performBatchOCRAPI } from '@/lib/api';
import { getUserInfo, logoutAPI, getToken } from '@/lib/api';
import { saveMessage } from '@/lib/chatHistory';
import DatabaseManager from '@/components/DatabaseManager';
import { ToolsPanel } from '@/components/ToolsPanel';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';

import { models } from '@/components/ModelSelector';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { API_BASE_URL } from '@/lib/api';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { ReportDashboard } from '@/components/ReportDashboard';

// Dual Chain Model Selector Component
interface DualChainModelSelectorProps {
  selectedModels: [string, string];
  onModelsChange: (models: [string, string]) => void;
}

const DualChainModelSelector = ({ selectedModels, onModelsChange }: DualChainModelSelectorProps) => {
  const [model1, model2] = selectedModels;
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; description: string; category: string}>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await apiFetch<Array<{id: number; name: string; description: string | null; is_default: number}>>('/models/enabled');
        if (data && data.length > 0) {
          const formattedModels = data.map(model => {
            const name = model.name.toLowerCase();
            let category = 'General';
            if (name.includes('deepseek') || name.includes('coder') || name.includes('codellama')) {
              category = 'Coding';
            } else if (name.includes('vl') || name.includes('vision')) {
              category = 'Multimodal';
            }
            return {
              id: model.name,
              name: model.name,
              description: model.description || category,
              category
            };
          });
          setAvailableModels(formattedModels);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-[220px] h-10 bg-slate-900 border border-[#A259FF] rounded-xl animate-pulse"></div>
        <div className="w-[220px] h-10 bg-slate-900 border border-[#A259FF] rounded-xl animate-pulse"></div>
      </div>
    );
  }

  const modelsToUse = availableModels.length > 0 ? availableModels : models.map(m => ({
    id: m.id as string,
    name: m.name,
    description: m.description,
    category: m.category || 'General'
  }));

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-400 font-medium">Model 1:</span>
      <Select value={model1} onValueChange={val => onModelsChange([val, model2 === val ? '' : model2])}>
        <SelectTrigger className="w-[220px] bg-slate-900 border-[#A259FF] text-white hover:bg-[#6C47FF]/10 transition-all duration-200 shadow-lg rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-[#A259FF] shadow-2xl rounded-xl">
            {modelsToUse.map((model) => (
            <SelectItem
              key={model.id}
              value={model.id}
              disabled={model.id === model2}
              className="text-white hover:bg-[#6C47FF]/20 focus:bg-[#A259FF]/20 cursor-pointer rounded-xl"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
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
        </SelectContent>
      </Select>
      <span className="text-sm text-slate-400 font-medium">Model 2:</span>
      <Select value={model2} onValueChange={val => onModelsChange([model1 === val ? '' : model1, val])}>
        <SelectTrigger className="w-[220px] bg-slate-900 border-[#A259FF] text-white hover:bg-[#6C47FF]/10 transition-all duration-200 shadow-lg rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-[#A259FF] shadow-2xl rounded-xl">
            {modelsToUse.map((model) => (
            <SelectItem
              key={model.id}
              value={model.id}
              disabled={model.id === model1}
              className="text-white hover:bg-[#6C47FF]/20 focus:bg-[#A259FF]/20 cursor-pointer rounded-xl"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
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
        </SelectContent>
      </Select>
    </div>
  );
};

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  model?: string;
  timestamp: Date;
  searchResults?: string;
  isChained?: boolean;
  chainResponses?: Array<{ model: string; response: string }>;
  isError?: boolean;
  uploadedFiles?: Array<{ name: string; type: string }>;
  // Data analysis specific fields
  isDataAnalysis?: boolean;
  analysisCode?: string;
  analysisOutput?: string;
  analysisChart?: string;
  analysisExplanation?: string;
  // OCR specific fields
  isOCR?: boolean;
  ocrText?: string;
  ocrConfidence?: number;
  ocrLanguages?: string;
  ocrFilenames?: string[];
}

interface ChatInterfaceProps {
  chatId: string;
  onLogout?: () => void;
}

// CSV file info interface
interface CSVInfo {
  has_csv: boolean;
  filename?: string;
  uploaded_at?: string;
  shape?: [number, number];
  columns?: string[];
  dtypes?: Record<string, string>;
  sample_data?: any[];
}

// Utility: Preprocess plain text to markdown for better formatting
function autoFormatMarkdown(text: string): string {
  // Convert 'Features:' or 'How to Use:' to headings
  let formatted = text.replace(/^(Features|How to Use|Conclusion|Future Trends|Applications of AI|Challenges and Ethical Considerations|Core AI Technologies|Key Types of AI):?/gim, (m) => `### ${m.replace(':','')}`);

  // Convert lines starting with dash, bullet, or similar to markdown bullets
  formatted = formatted.replace(/^(\s*[-•])\s?/gm, '- ');

  // Convert numbered steps to markdown ordered list
  formatted = formatted.replace(/^(\d+)\.\s+/gm, (m, n) => `${n}. `);

  // Add spacing before headings
  formatted = formatted.replace(/(\n)?(### )/g, '\n$2');

  // Remove duplicate blank lines
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
}

// Utility: Convert plain URLs to clickable links (for web search results)
function linkify(text: string): string {
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[\w\-._~:\/?#[\]@!$&'()*+,;=%]+)(?![^<]*>|[^\[]*\])/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline;">${url}</a>`);
}

const fileTypeIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return <FileText className="h-4 w-4 text-emerald-400" />;
  if (["png", "jpg", "jpeg", "bmp", "tiff", "gif", "svg"].includes(ext)) return <Image className="h-4 w-4 text-emerald-400" />;
  if (["pdf"].includes(ext)) return <FileText className="h-4 w-4 text-red-400" />;
  if (["doc", "docx"].includes(ext)) return <FileText className="h-4 w-4 text-blue-400" />;
  if (["csv"].includes(ext)) return <Database className="h-4 w-4 text-green-400" />;
  return <FileText className="h-4 w-4 text-gray-400" />;
};

// Data Analysis API functions (add these to your api.ts file)
const uploadCSV = async (file: File, sessionId: string): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  
  console.log('Uploading file:', {
    name: file.name,
    size: file.size,
    type: file.type,
    sessionId
  });

  try {
    const response = await fetch(`${API_BASE_URL}/upload-csv?session_id=${sessionId}`, {
      method: 'POST',
      // Cookie-only auth: don't set Authorization header, use credentials
      credentials: 'include',
      body: formData,
    });

    const responseData = await response.text();
    console.log('Raw upload response:', responseData);
    
    let jsonResponse;
    try {
      jsonResponse = responseData ? JSON.parse(responseData) : {};
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      throw new Error(`Invalid server response: ${responseData.substring(0, 200)}...`);
    }

    console.log('Upload response:', {
      status: response.status,
      statusText: response.statusText,
      data: jsonResponse
    });

    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status} - ${response.statusText}`) as any;
      error.response = {
        status: response.status,
        statusText: response.statusText,
        data: jsonResponse.detail || responseData
      };
      throw error;
    }

    console.log('Upload successful:', jsonResponse);
    return jsonResponse;
    
  } catch (error: any) {
    console.error('Upload error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      response: error.response
    });
    throw error;
  }
};

const getCSVInfo = async (sessionId: string): Promise<CSVInfo> => {
  const response = await fetch(`${API_BASE_URL}/csv-info?session_id=${sessionId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

const dataAnalysisStream = async function* (
  prompt: string,
  sessionId: string,
  model: string = 'deepseek-coder-v2:latest'
) {
  const response = await fetch(`${API_BASE_URL}/data-analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      prompt,
      session_id: sessionId,
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          yield data;
        } catch (e) {
          // Skip invalid JSON lines
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const ChatInterface = ({ chatId, onLogout }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(chatId || uuidv4());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedFileInfos, setUploadedFileInfos] = useState<Array<{filename: string; uploaded_at: string}>>([]);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [chainMode, setChainMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama3.1:latest');
  const [selectedChainModels, setSelectedChainModels] = useState<[string, string]>(['llama3.1:latest', 'gemma3:270m']);
  const [listening, setListening] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Data Analysis specific states
  const [dataAnalysisMode, setDataAnalysisMode] = useState(false);
  const [csvInfo, setCsvInfo] = useState<CSVInfo>({ has_csv: false });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [selectedAnalysisModel, setSelectedAnalysisModel] = useState('deepseek-coder-v2:latest');
  const [showDatabaseManager, setShowDatabaseManager] = useState(false);
  const [dbLoadedData, setDbLoadedData] = useState<any[] | null>(null);
  
  // OCR specific states
  const [ocrMode, setOcrMode] = useState(false);
  const [toolsMode, setToolsMode] = useState(false);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrLanguages, setOcrLanguages] = useState<Record<string, string>>({});
  const [selectedOcrLanguage, setSelectedOcrLanguage] = useState('hin');
  const [ocrEnhance, setOcrEnhance] = useState(true);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  
  // Dashboard Viewer states
  const [dashboardHtml, setDashboardHtml] = useState<string | null>(null);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [analyticsPanelOpen, setAnalyticsPanelOpen] = useState(false);
  
  // Automatically detect the latest HTML artifact in the chat history and auto-open the preview
  useEffect(() => {
    const lastHtmlMsg = [...messages].reverse().find(msg => 
      !msg.isUser && (
        /```html[\s\S]*?```/i.test(msg.content) ||
        msg.content.includes('<!DOCTYPE html>') ||
        msg.content.includes('<html')
      )
    );
    
    if (lastHtmlMsg) {
      // Extract the HTML content — prefer fenced code block, fallback to raw
      const fencedMatch = /```html\n([\s\S]*?)\n```/i.exec(lastHtmlMsg.content);
      const htmlContent = fencedMatch ? fencedMatch[1] : lastHtmlMsg.content;
      setDashboardHtml(htmlContent);
      // Auto-open the side panel whenever a new HTML artifact is detected
      setIsDashboardOpen(true);
    }
  }, [messages]);

  // Load OCR languages when OCR mode is enabled
  useEffect(() => {
    const loadOcrLanguages = async () => {
      if (!ocrMode) return;
      
      try {
        const languages = await getOCRLanguagesAPI();
        setOcrLanguages(languages.languages || {});
      } catch (error) {
        console.error('Failed to load OCR languages:', error);
        // Fallback to default languages (including all Indian languages)
        setOcrLanguages({
          "eng": "English",
          "hin": "Hindi (हिन्दी)",
          "ben": "Bengali (বাংলা)",
          "tam": "Tamil (தமிழ்)",
          "tel": "Telugu (తెలుగు)",
          "mar": "Marathi (मराठी)",
          "guj": "Gujarati (ગુજરાતી)",
          "kan": "Kannada (ಕನ್ನಡ)",
          "mal": "Malayalam (മലയാളം)",
          "pan": "Punjabi (ਪੰਜਾਬੀ)",
          "ori": "Oriya (ଓଡିଆ)",
          "asm": "Assamese (অসমীয়া)",
          "urd": "Urdu (اردو)",
          "nep": "Nepali (नेपाली)",
          "san": "Sanskrit (संस्कृत)",
          "spa": "Spanish",
          "fra": "French",
          "deu": "German"
        });
      }
    };
    
    loadOcrLanguages();
  }, [ocrMode]);
  
  // Web search toggle states
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [webSearchEnabledGlobally, setWebSearchEnabledGlobally] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Helper function to trigger sidebar refresh
  const refreshSidebar = () => {
    window.dispatchEvent(new Event('refreshSidebar'));
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50); // 50px threshold
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom]);

  // Load chat history when chatId changes
  useEffect(() => {
    const loadChatHistory = async () => {
      console.log('Loading chat history for chatId:', chatId);
      if (!chatId) {
        console.log('No chatId provided, skipping load');
        return;
      }
      
      // Update sessionId to match the selected chat
      setSessionId(chatId);
      console.log('Set sessionId to:', chatId);
      
      try {
        // Load messages from backend
        console.log('Fetching chat history from API...');
        const history = await getChatHistoryAPI(chatId);
        console.log('Received chat history:', history);
        
        if (history && history.length > 0) {
          console.log(`Processing ${history.length} history items`);
          // Create pairs of user/bot messages
          const messagePairs: Message[] = [];
          history.forEach((msg: any) => {
            console.log('Processing history item:', msg);
            if (msg.prompt) {
              messagePairs.push({
                id: `${msg.id}-user`,
                content: msg.prompt,
                isUser: true,
                timestamp: new Date(msg.timestamp),
              });
            }
            if (msg.response) {
              messagePairs.push({
                id: `${msg.id}-bot`,
                content: msg.response,
                isUser: false,
                timestamp: new Date(msg.timestamp),
                model: msg.model_used || 'Unknown',
              });
            }
          });
          
          console.log(`Created ${messagePairs.length} message pairs`);
          setMessages(messagePairs);
        } else {
          console.log('No history found, clearing messages');
          // Clear messages for new chat
          setMessages([]);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message, error.stack);
        }
        // If chat doesn't exist yet (new chat), just clear messages
        setMessages([]);
      }
      
      // Reset other states for new chat
      console.log('Resetting chat states');
      setInput('');
      setUploadedFiles([]);
      setUploadedFileInfos([]);
      setCsvFile(null);
      setCsvInfo({ has_csv: false });
    };
    
    loadChatHistory();
  }, [chatId]);

  useEffect(() => {
    const checkUploadStatus = async () => {
      if (!sessionId) return;
      
      try {
        // Check if web search is enabled (global + user permission)
        try {
          const webSearchStatus = await apiFetch<{
            enabled: boolean;
            global_enabled: boolean;
            user_enabled: boolean;
          }>('/settings/web-search-enabled');
          setWebSearchEnabledGlobally(webSearchStatus?.enabled ?? true);
        } catch (error) {
          console.log('Could not fetch web search status, defaulting to enabled');
          setWebSearchEnabledGlobally(true);
        }
        
        // Check CSV info for data analysis mode
        if (dataAnalysisMode) {
          try {
            const csvStatus = await getCSVInfo(sessionId);
            setCsvInfo(csvStatus);
          } catch (error) {
            console.log('No CSV info found, will be created on first upload');
          }
        }
      } catch (error) {
        console.error('Error checking upload status:', error);
      }
    };
    
    checkUploadStatus();
  }, [sessionId, dataAnalysisMode]);

  const callModelAPI = async (prompt: string, model: string): Promise<string> => {
    try {
      const result = await apiService.askModel(prompt, model, sessionId);
      return result?.response || '';
    } catch (error) {
      console.error(`Error calling model ${model}:`, error);
      throw error;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newFiles = files.filter(file => 
      !uploadedFiles.some(f => f.name === file.name && f.size === file.size)
    );

    if (newFiles.length === 0) {
      toast.info('These files have already been added.');
      return;
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);

    try {
      const uploadResult = await uploadFilesAPI(files, sessionId);
      
      // Update file list with server response
      setUploadedFileInfos(prev => [
        ...prev,
        ...(uploadResult.files || []).map((f: any) => ({
          filename: f.filename,
          uploaded_at: new Date().toISOString()
        }))
      ]);

      // Show success message
      const uploadMessage: Message = {
        id: Date.now().toString(),
        content: `📁 **Files Uploaded:**\n${uploadResult.files.map((f: any) => `• ${f.filename}`).join('\n')}`,
        isUser: false,
        timestamp: new Date(),
        uploadedFiles: uploadResult.files.map((f: any) => ({
          name: f.filename,
          type: f.filename.split('.').pop()?.toLowerCase() || 'file'
        }))
      };

      setMessages(prev => [...prev, uploadMessage]);
      
      // Save to chat history
      await saveChatMessageAPI(sessionId, `[Uploaded files: ${newFiles.map(f => f.name).join(', ')}]`, uploadMessage.content, selectedModel);
      refreshSidebar();
      
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files. Please try again.');
      // Remove the files from state if upload fails
      setUploadedFiles(prev => prev.filter(f => !newFiles.some(nf => nf.name === f.name)));
    }
  };

  // Handle CSV file upload for data analysis
  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (csvInputRef.current) {
      csvInputRef.current.value = '';
    }

    // Basic validation
    if (!file.name || !file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    // Check file size (e.g., 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File is too large. Maximum size is 10MB');
      return;
    }

    setIsLoading(true);
    
    // Show uploading toast
    const toastId = toast.loading('Uploading CSV file...');
    
    try {
      const result = await uploadCSV(file, sessionId);
      
      // Validate response
      if (!result || !result.filename || !result.shape || !result.columns) {
        throw new Error('Invalid response from server');
      }

      const csvInfo = {
        has_csv: true,
        filename: result.filename,
        uploaded_at: new Date().toISOString(),
        shape: result.shape,
        columns: result.columns,
        dtypes: result.dtypes || {},
        sample_data: result.sample_data || []
      };

      setCsvInfo(csvInfo);

      // Show success message
      const uploadMessage: Message = {
        id: `csv-${Date.now()}`,
        content: `📊 **Dataset Uploaded:** ${result.filename}\n\n` +
                `**Shape:** ${result.shape[0]} rows × ${result.shape[1]} columns\n\n` +
                `**Columns:** ${result.columns.join(', ')}\n\n` +
                `✅ Ready for data analysis! Ask me anything about your dataset.`,
        isUser: false,
        timestamp: new Date(),
        isDataAnalysis: true
      };

      setMessages(prev => [...prev, uploadMessage]);
      
      // Update success toast
      toast.success('CSV uploaded successfully!', { id: toastId });
      
    } catch (error: any) {
      console.error('CSV upload error:', error);
      
      let errorMessage = 'Failed to upload CSV';
      if (error.response) {
        // Server responded with an error status code
        errorMessage = error.response.data?.detail || error.response.statusText || errorMessage;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'No response from server. Please check your connection.';
      } else if (error.message) {
        // Something happened in setting up the request
        errorMessage = error.message;
      }
      
      toast.error(`Upload failed: ${errorMessage}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OCR file upload
  const handleOCRUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Reset file input
    if (ocrInputRef.current) {
      ocrInputRef.current.value = '';
    }

    // Filter valid image types
    const validTypes = ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'gif', 'webp'];
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext && validTypes.includes(ext);
    });

    if (validFiles.length === 0) {
      toast.error('Please upload valid image files (PNG, JPG, JPEG, BMP, TIFF, GIF, WEBP)');
      return;
    }

    // Check total file size (e.g., 20MB limit)
    const totalSize = validFiles.reduce((acc, file) => acc + file.size, 0);
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (totalSize > maxSize) {
      toast.error('Total file size is too large. Maximum size is 20MB');
      return;
    }

    setOcrFiles(validFiles);
    
    // Process OCR immediately
    setIsLoading(true);
    const toastId = toast.loading(`Processing ${validFiles.length} image(s) with OCR...`);
    
    try {
      let results;
      let ocrText = '';
      let ocrConfidence = 0;
      
      if (validFiles.length === 1) {
        // Single image OCR
        const result = await performOCRAPI(
          validFiles[0],
          selectedOcrLanguage,
          ocrEnhance,
          'both'
        );
        
        ocrText = result.text || result.ocr_data?.text || '';
        ocrConfidence = result.ocr_data?.confidence || 0;
        
        results = [{
          filename: validFiles[0].name,
          success: true,
          text: ocrText,
          confidence: ocrConfidence
        }];
      } else {
        // Batch OCR
        const result = await performBatchOCRAPI(
          validFiles,
          selectedOcrLanguage,
          ocrEnhance
        );
        
        results = result.results;
        
        // Aggregate results
        ocrText = results.map(r => r.text).filter(t => t).join('\n\n--- ---\n\n');
        ocrConfidence = results.reduce((acc, r) => acc + (r.confidence || 0), 0) / results.length;
      }

      // Create a user message with the OCR prompt
      const ocrPromptMessage: Message = {
        id: `ocr-prompt-${Date.now()}`,
        content: `[OCR extracted text from: ${validFiles.map(f => f.name).join(", ")}]\n\n${ocrText}`,
        isUser: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, ocrPromptMessage]);
      
      // Create placeholder for LLM response
      const llmResponseMessage: Message = {
        id: `ocr-llm-${Date.now()}`,
        content: "",
        isUser: false,
        model: selectedModel,
        timestamp: new Date(),
        isOCR: true,
      };
      setMessages(prev => [...prev, llmResponseMessage]);
      
      // Call LLM with OCR text
      try {
        let llmResponse = "";
        for await (const chunk of askModelStreamWithSearch(
          `Please analyze and summarize the following extracted text from an image. If there are any tables, lists, or structured data, please present them in a well-organized format.\n\nExtracted Text:\n${ocrText}`,
          selectedModel,
          sessionId,
          getToken(),
          null,
          false // Disable web search for OCR processing
        )) {
          if (chunk.type === "model_response" && chunk.response) {
            llmResponse += chunk.response;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === llmResponseMessage.id
                  ? { ...msg, content: llmResponse }
                  : msg
              )
            );
          } else if (chunk.type === "error") {
            throw new Error(chunk.error);
          }
        }
        
        // Save the complete exchange to chat history
        await saveChatMessageAPI(sessionId, ocrPromptMessage.content, llmResponse, selectedModel);
        refreshSidebar();
      } catch (llmError) {
        console.error("LLM processing error:", llmError);
        // Fallback to showing raw OCR text if LLM fails
        setMessages(prev =>
          prev.map(msg =>
            msg.id === llmResponseMessage.id
              ? { ...msg, content: ocrText || "No text extracted from images.", ocrConfidence: ocrConfidence }
              : msg
          )
        );
      }
      
      // Save to chat history
      await saveChatMessageAPI(
        sessionId, 
        `[OCR: ${validFiles.map(f => f.name).join(', ')}]`, 
        ocrText || 'No text extracted', 
        'OCR'
      );
      refreshSidebar();
      
      // Clear files after successful processing
      setOcrFiles([]);
      
      toast.success(`OCR completed! Extracted ${ocrText.split(/\s+/).filter(w => w).length} words.`, { id: toastId });
      
    } catch (error: any) {
      console.error('OCR error:', error);
      
      let errorMessage = 'Failed to process OCR';
      if (error.message) {
        errorMessage = error.message;
      }
      
      const errorMsg: Message = {
        id: `ocr-error-${Date.now()}`,
        content: `❌ **OCR Error:** ${errorMessage}\n\nPlease check that:\n• The image files are valid\n• Tesseract OCR is properly installed on the server`,
        isUser: false,
        timestamp: new Date(),
        isError: true,
        isOCR: true
      };
      
      setMessages(prev => [...prev, errorMsg]);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && uploadedFiles.length === 0) return;

    if (backendConnected === false) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "❌ **Backend Not Connected**\n\nPlease ensure the AI backend server is running before sending messages. Check that the backend server is started and accessible.",
        isUser: false,
        model: 'error',
        timestamp: new Date(),
        isError: true,
        uploadedFiles: []
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    let messageContent = input;

    // Handle data analysis mode
    if (dataAnalysisMode) {
      if (!csvInfo.has_csv) {
        toast.error('Please upload a CSV file first');
        return;
      }

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content: input,
        isUser: true,
        timestamp: new Date(),
        isDataAnalysis: true
      };
      setMessages(prev => [...prev, userMessage]);

      // Reset input and start loading
      setInput('');
      setIsLoading(true);

      try {
        // Create assistant message for data analysis
        const assistantMessage: Message = {
          id: `${Date.now()}-analysis`,
          content: '',
          isUser: false,
          model: selectedAnalysisModel,
          timestamp: new Date(),
          isDataAnalysis: true,
          analysisCode: '',
          analysisOutput: '',
          analysisChart: '',
          analysisExplanation: ''
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Stream data analysis response
        for await (const chunk of dataAnalysisStream(messageContent, sessionId, selectedAnalysisModel)) {
          if (chunk.type === 'status') {
            // Update message with status
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, content: chunk.message }
                  : msg
              )
            );
          } else if (chunk.type === 'code') {
            // Show generated code
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, analysisCode: chunk.content }
                  : msg
              )
            );
          } else if (chunk.type === 'output') {
            // Show analysis output
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, analysisOutput: chunk.content }
                  : msg
              )
            );
          } else if (chunk.type === 'chart') {
            // Show generated chart
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, analysisChart: chunk.content }
                  : msg
              )
            );
          } else if (chunk.type === 'explanation') {
            // Show explanation
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, content: chunk.content, analysisExplanation: chunk.content }
                  : msg
              )
            );
          } else if (chunk.type === 'error') {
            // Show error
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, content: `❌ **Analysis Error:** ${chunk.content}`, isError: true }
                  : msg
              )
            );
          }
        }

        // Save to chat history
        await saveChatMessageAPI(sessionId, messageContent, assistantMessage.content || 'Data analysis completed', 'data-analysis');
        refreshSidebar();

      } catch (error) {
        console.error('Data analysis error:', error);
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `❌ **Data Analysis Error**\n\n${error instanceof Error ? error.message : "Failed to perform data analysis"}\n\nPlease try again or check your CSV file format.`,
          isUser: false,
          timestamp: new Date(),
          isError: true,
          isDataAnalysis: true
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Handle file uploads (existing logic)
    if (uploadedFiles.length > 0) {
      setIsLoading(true);
      try {
        const uploadResult = await uploadFilesAPI(uploadedFiles, sessionId);
        
        // Update upload status if CSV was uploaded
        setUploadedFileInfos(prev => [
          ...prev,
          ...(uploadResult.files || []).map((f: any) => ({
            filename: f.filename,
            uploaded_at: new Date().toISOString()
          }))
        ]);

        // Show success message
        const uploadMessage: Message = {
          id: Date.now().toString(),
          content: `📁 **Files Uploaded:**\n${uploadResult.files.map((f: any) => `• ${f.filename}`).join('\n')}`,
          isUser: false,
          timestamp: new Date(),
          uploadedFiles: uploadResult.files.map((f: any) => ({
            name: f.filename,
            type: f.filename.split('.').pop()?.toLowerCase() || 'file'
          }))
        };

        setMessages(prev => [...prev, uploadMessage]);
        
        // Save to chat history
        await saveChatMessageAPI(sessionId, `[Uploaded files: ${uploadedFiles.map(f => f.name).join(', ')}]`, uploadMessage.content, selectedModel);
        refreshSidebar();
        
        // Reset UI states for new request
        setInput('');
        setUploadedFiles([]);
        setIsLoading(false);
      } catch (err) {
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `❌ **File Processing Error**\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease try uploading the file again or check if the file format is supported.`,
          isUser: false,
          timestamp: new Date(),
          isError: true
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsLoading(false);
        return;
      }
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      isUser: true,
      timestamp: new Date(),
      uploadedFiles: uploadedFiles.map(f => ({ name: f.name, type: f.type })),
    };
    setMessages(prev => [...prev, userMessage]);

    // Save to IndexedDB for sidebar/session history
    const user = getUserInfo();
    if (user) {
      const userId = user.username + '_' + sessionId;
      await saveMessage(userId, { sessionId, content: input });
    }

    // Reset UI states for new request
    setInput('');
    setUploadedFiles([]);
    setIsLoading(true);

    try {
      // ----- CHAIN MODE -----
      if (chainMode && selectedChainModels[0] && selectedChainModels[1]) {
        let currentModel = '';
        let currentResponse = '';
        let gotFirstChunk = false;

        for await (const chunk of chainModelsStream(
          messageContent,
          selectedChainModels,
          getToken(),
          null
        )) {
          if (!gotFirstChunk && chunk.response) {
            gotFirstChunk = true;
          }

          if (chunk.model !== currentModel) {
            currentModel = chunk.model;
            currentResponse = '';
            setMessages(prev => [
              ...prev,
              { id: `${Date.now()}-chain-${currentModel}`, content: '', isUser: false, model: currentModel, timestamp: new Date(), isChained: true }
            ]);
          }

          if (chunk.response !== undefined) {
            currentResponse += chunk.response;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.model === currentModel && last.isChained) {
                return [...prev.slice(0, -1), { ...last, content: currentResponse }];
              } else {
                return prev;
              }
            });
          }
        }

        const finalBotMsg = messages[messages.length - 1];
        if (finalBotMsg && finalBotMsg.content) {
          await saveChatMessageAPI(sessionId, messageContent, finalBotMsg.content, selectedDualChainModels.join(' -> '));
          refreshSidebar();
        }

      } 
      // ----- SINGLE MODEL WITH SEARXNG -----
      else {
        let responseText = '';
        let gotFirstChunk = false;
        let searchResultsContent = '';

        // Create assistant message with search results field
        const assistantMessage: Message = {
          id: `${Date.now()}-single`,
          content: '',
          isUser: false,
          model: selectedModel,
          timestamp: new Date(),
          searchResults: '' // Initialize search results
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Use the enhanced streaming function with search
        for await (const chunk of askModelStreamWithSearch(
          messageContent,
          selectedModel,
          sessionId,
          getToken(),
          null,
          useWebSearch // Pass the web search toggle state
        )) {
          if (chunk.type === 'search_results') {
            searchResultsContent = chunk.content;
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, searchResults: searchResultsContent }
                  : msg
              )
            );
          } else if (chunk.type === 'model_response') {
            if (!gotFirstChunk && chunk.response) {
              gotFirstChunk = true;
            }
             if (!chunk.done && chunk.response) {
              responseText += chunk.response;
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: responseText }
                    : msg
                )
              );
            }
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
        }

        await saveChatMessageAPI(sessionId, messageContent, responseText, selectedModel);
        refreshSidebar();
      }
    } 
    catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ **Error Generating Response**\n\n${error instanceof Error ? error.message : "Failed to generate response"}\n\nThis could be due to:\n• Backend server issues\n• API key problems\n• Network connectivity issues\n• Model availability\n\nPlease try again or check your backend connection.`,
        isUser: false,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } 
    finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startListening = () => {
    if (!(window as any).webkitSpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    
    if (listening) {
      setListening(false);
      return;
    }
    
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      setListening(true);
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      setInput(prev => prev + transcript);
    };

    recognition.start();
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    } else {
      try {
        await logoutAPI();
      } catch (e) {
        // Continue with logout even if API call fails
      }
      window.location.reload();
    }
  };

  const components = {
    img: ({node, ...props}: any) => {
      // Convert relative URLs to absolute URLs
      const src = props.src?.startsWith('http') 
        ? props.src 
        : `${API_BASE_URL}${props.src}`;
      
      return <img {...props} src={src} alt={props.alt} style={{maxWidth: '100%', height: 'auto'}} />;
    },
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #181C5A 0%, #B983FD 100%)',
            }}>
              <span className="text-primary-foreground font-bold text-base" style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>N</span>
            </span>
            <h1 className="text-lg font-bold text-gray-900">NemHem AI</h1>
            {dataAnalysisMode && (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                <Database className="h-3 w-3 mr-1" />
                Data Analysis
              </Badge>
            )}
            {ocrMode && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                <ScanText className="h-3 w-3 mr-1" />
                OCR
              </Badge>
            )}
            {toolsMode && (
              <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                <ScanText className="h-3 w-3 mr-1" />
                Tools
              </Badge>
            )}
          </span>
          <div className="flex items-center gap-4">
            {/* Data Analysis Redirect */}
            <Button
              onClick={() => {
                window.open('http://localhost:8080', '_blank');
              }}
              variant="outline"
              className="flex items-center gap-1 rounded-xl text-slate-200 hover:bg-slate-700/50 border-slate-600"
            >
              <Database className="h-4 w-4 mr-1" />
              Data Analysis
            </Button>
            
            {/* OCR Toggle */}
            <Button
              onClick={() => {
                setOcrMode(!ocrMode);
                if (ocrMode) {
                  setOcrFiles([]);
                } else {
                  setMessages(prev => prev.filter(m => !m.isOCR));
                }
              }}
              variant={ocrMode ? "default" : "outline"}
              className={`flex items-center gap-1 rounded-xl ${ocrMode ? 'bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white' : 'text-slate-200 hover:bg-slate-700/50 border-slate-600'}`}
            >
              <ScanText className="h-4 w-4 mr-1" />
              OCR
            </Button>
            
            {/* Tools Toggle */}
            <Button
              onClick={() => {
                const next = !toolsMode;
                setToolsMode(next);
                setToolsPanelOpen(next);
              }}
              variant={toolsMode ? "default" : "outline"}
              className={`flex items-center gap-1 rounded-xl ${toolsMode ? 'bg-gradient-to-r from-[#6C47FF] to-[#A259FF] text-white' : 'text-slate-200 hover:bg-slate-700/50 border-slate-600'}`}
            >
              <ScanText className="h-4 w-4 mr-1" />
              Tools
            </Button>

            {/* Dashboard Viewer Trigger */}
            <Button
              onClick={() => setIsDashboardOpen(true)}
              disabled={!dashboardHtml}
              variant={dashboardHtml ? "default" : "outline"}
              className={`flex items-center gap-1 rounded-xl transition-all duration-300 ${
                dashboardHtml 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg hover:brightness-110' 
                  : 'text-slate-400 border-slate-600 opacity-50 cursor-not-allowed'
              }`}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              View Dashboard
            </Button>
            
            {/* Model Name Badge */}
            <Badge variant="outline" className="text-slate-400 border-slate-600 bg-slate-800/50">
              {dataAnalysisMode 
                ? selectedAnalysisModel
                : chainMode 
                  ? `${selectedChainModels[0] || ''}${selectedChainModels && selectedChainModels[1] ? '/' : ''}${selectedChainModels[1] || ''}` 
                  : selectedModel
              }
            </Badge>
            {/* Profile Dropdown */}
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  className="bg-gradient-to-r from-[#181C5A] to-[#B983FD] text-white font-bold rounded-[12px] px-3 h-8 text-sm shadow-md hover:brightness-110 transition-all duration-200 flex items-center ml-2"
                >
                  <User className="h-4 w-4" />
                  Profile
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-slate-200">
                <DropdownMenuItem onClick={() => alert(`Username: ${getUserInfo()?.sub}\nRole: ${getUserInfo()?.role}`)}>
                  View Profile
                </DropdownMenuItem>
                {getUserInfo()?.role === 'admin' && (
                  <>
                    <DropdownMenuItem onClick={() => window.location.hash = '/admin'}>
                      Admin Panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.hash = '/dashboard'}>
                      Live Team Dashboard
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => handleLogout()} className="text-red-400">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1 min-h-0 px-4 py-2 overflow-y-auto" onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex items-center justify-center">
                  {/* NemHem AI Bot Logo */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: 'linear-gradient(90deg, #181C5A 0%, #B983FD 100%)',
                  }}>
                    <span className="text-primary-foreground font-bold text-2xl" style={{ color: 'white', fontWeight: 700, fontSize: 24 }}>N</span>
                  </span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Welcome to NemHem AI
                </h2>
                <p className="text-gray-500 mb-6">
                  {dataAnalysisMode 
                    ? "Upload a CSV file and start analyzing your data with AI-powered insights."
                    : "Start a conversation or enable chain mode to connect multiple AI models for enhanced responses."
                  }
                </p>
                {dataAnalysisMode && !csvInfo.has_csv && (
                  <Button
                    onClick={() => csvInputRef.current?.click()}
                    className="text-xs bg-slate-800/50 hover:bg-slate-700/70 text-slate-200 border-slate-600 rounded-xl"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Upload Dataset
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-2xl ${message.isUser ? 'justify-end' : 'justify-start'} items-start gap-2`}>
                    <div className={`relative rounded-xl px-4 py-2 pr-10 pb-4 shadow ${
                      message.isUser 
                        ? 'bg-[#A259FF] text-white'
                        : message.isError
                        ? 'bg-red-900/80 text-red-100 border border-red-700/50 backdrop-blur-sm'
                        : 'bg-[#F5F6FA] text-black border border-gray-200'
                    }`}>
                      
                      {/* Enhanced SearxNG Search Results Display */}
                      {!message.isUser && message.searchResults && (
                        <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700/50 shadow-sm">
                          <div className="flex items-center gap-2 text-sm font-bold text-blue-800 dark:text-blue-200 mb-3">
                            <Link2 className="w-5 h-5" />
                            🔍 Search Sources
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white/50 dark:bg-black/20 p-3 rounded border border-blue-100 dark:border-blue-800/30">
                            {message.searchResults}
                          </div>
                        </div>
                      )}

                      {/* Data Analysis Code Display */}
                      {message.analysisCode && (
                        <div className="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-600">
                          <div className="flex items-center gap-2 text-sm font-bold text-green-400 mb-3">
                            <FileText className="w-4 h-4" />
                            Generated Code
                          </div>
                          <pre className="text-green-300 text-sm overflow-x-auto">
                            <code>{message.analysisCode}</code>
                          </pre>
                          <CopyButton text={message.analysisCode} />
                        </div>
                      )}

                      {/* Data Analysis Output Display */}
                      {message.analysisOutput && (
                        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-3">
                            <BarChart3 className="w-4 h-4" />
                            Analysis Output
                          </div>
                          <pre className="text-blue-900 text-sm whitespace-pre-wrap">
                            {message.analysisOutput}
                          </pre>
                        </div>
                      )}

                      {/* Data Analysis Chart Display */}
                      {message.analysisChart && (
                        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex items-center gap-2 text-sm font-bold text-green-800 mb-3">
                            <BarChart3 className="w-4 h-4" />
                            Generated Visualization
                          </div>
                          <img 
                            src={`data:image/png;base64,${message.analysisChart}`} 
                            alt="Data Analysis Chart"
                            className="max-w-full h-auto rounded border"
                          />
                        </div>
                      )}

                      {/* Copy button for bot/assistant only */}
                      {!message.isUser && (
                        <div className="absolute bottom-2 right-2 z-10">
                          <CopyButton text={message.content} />
                        </div>
                      )}
                      
                      {/* Error badge */}
                      {message.isError && (
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs bg-red-700 text-red-100 border-red-600">
                              Error
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Model badge */}
                      {!message.isUser && !message.isError && message.model && (
                        <div className="mb-2">
                          <Badge variant="secondary" className="text-xs">
                            {message.model}
                          </Badge>
                          {message.isDataAnalysis && (
                            <Badge variant="secondary" className="text-xs ml-2 bg-green-100 text-green-800">
                              Data Analysis
                            </Badge>
                          )}
                          {message.isOCR && (
                            <Badge variant="secondary" className="text-xs ml-2 bg-blue-100 text-blue-800">
                              OCR
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Show uploaded file names */}
                      {message.uploadedFiles && message.uploadedFiles.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {message.uploadedFiles.map((file, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              📄 {file.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* Enhanced Markdown Message Content */}
                      <div className={`prose max-w-none ${message.isError ? 'text-red-100' : (!message.isUser ? 'text-black' : 'text-slate-100')}`}>
                        {(() => {
                          try {
                            if (!message.isUser && message.content.trim().startsWith('{') && message.content.trim().endsWith('}')) {
                              const data = JSON.parse(message.content);
                              if (data.type === 'dashboard_report') {
                                return <ReportDashboard data={data} />;
                              }
                            }
                          } catch (e) {
                            // Fallback to markdown if parsing fails
                          }
                          
                          return (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                img: ({node, ...props}: any) => {
                                  const src = props.src?.startsWith('http') 
                                    ? props.src 
                                    : `${API_BASE_URL}${props.src}`;
                                  
                                  return <img {...props} src={src} alt={props.alt} style={{maxWidth: '100%', height: 'auto', borderRadius: '8px'}} />;
                                },
                                code({node, inline, className, children, ...props}: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const language = match ? match[1] : '';
                                  const codeString = String(children).replace(/\n$/, '');
                                  // Detect any HTML artifact — complete documents or fragments with tags
                                  const isHtmlArtifact = language === 'html' || 
                                    (language === '' && (codeString.trimStart().startsWith('<!DOCTYPE') || codeString.trimStart().startsWith('<html')));

                                  return !inline ? (
                                    <div className="relative group my-2">
                                      <pre className={`rounded-lg ${message.isError ? 'bg-red-900/80 border border-red-700/60' : 'bg-slate-900/80 border border-slate-700/60'} p-4 overflow-x-auto text-sm font-mono ${className || ''}`}
                                        {...props}
                                      >
                                        <code>{children}</code>
                                      </pre>
                                      <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {isHtmlArtifact && (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 rounded-md shadow-lg flex items-center gap-2"
                                            onClick={() => {
                                              setDashboardHtml(codeString);
                                              setIsDashboardOpen(true);
                                            }}
                                          >
                                            <BarChart3 className="h-4 w-4" />
                                            Preview
                                          </Button>
                                        )}
                                        <CopyButton text={codeString} />
                                      </div>
                                    </div>
                                  ) : (
                                    <code className={`${message.isError ? 'bg-red-800/70 text-red-200' : 'bg-slate-800/70 text-emerald-300'} px-1.5 py-0.5 rounded font-mono text-sm ${className || ''}`}>{children}</code>
                                  );
                                },
                                a({node, ...props}: any) {
                                  return (
                                    <a 
                                      {...props} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className={
                                        (message.model === 'YouTube' || message.model === 'Reddit' || message.model === 'Academic' || message.model === 'Crypto') 
                                        ? 'text-blue-400 underline hover:text-blue-300 transition-colors cursor-pointer' 
                                        : 'text-blue-600 hover:text-blue-800 underline transition-colors cursor-pointer'
                                      } 
                                    />
                                  );
                                }
                              }}
                            >
                              {message.isUser ? message.content : message.content}
                            </ReactMarkdown>
                          );
                        })()}
                      </div>

                      {/* Chain responses */}
                      {message.chainResponses && (
                        <div className="mt-3 space-y-3">
                          {message.chainResponses.map((response, index) => (
                            <div key={index} className="border-l-2 border-gray-300 pl-3">
                              <Badge variant="outline" className="text-xs mb-1">
                                {response.model}
                              </Badge>
                              <div className="text-sm">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                  {response.response}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Show if message is part of a chain */}
                      {message.isChained && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs">
                            Chain Response
                          </Badge>
                        </div>
                      )}
                      
                      {/* Timestamp */}
                      <div className="text-xs text-gray-500 mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="flex gap-4 max-w-4xl">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg" style={{ background: '#A259FF' }}>
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="bg-[#44485A] rounded-2xl px-6 py-4 border border-gray-200 shadow-lg">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#A259FF' }}></div>
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#A259FF', animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#A259FF', animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </div>
      
      {/* Input Area */}
      <div className="bg-[#E5E7EB] p-6 shadow-[0_-2px_16px_0_rgba(24,28,90,0.04)] border-t border-gray-200 rounded-b-[20px]">
        {/* Database Manager for Data Analysis Mode */}
        {dataAnalysisMode && showDatabaseManager && (
            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Database Connections</h3>
                <button
                  onClick={() => setShowDatabaseManager(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              <DatabaseManager
                onDataLoaded={(data, tableName) => {
                  setDbLoadedData(data);
                  setShowDatabaseManager(false);
                  
                  // Create a message showing data was loaded
                  const loadMessage: Message = {
                    id: `db-${Date.now()}`,
                    content: `📊 **Database Data Loaded:** ${tableName}\n\n` +
                            `**Rows:** ${data.length}\n\n` +
                            `**Columns:** ${Object.keys(data[0] || {}).join(', ')}\n\n` +
                            `✅ Ready for data analysis! Ask me anything about this data.`,
                    isUser: false,
                    timestamp: new Date(),
                    isDataAnalysis: true
                  };
                  
                  setMessages(prev => [...prev, loadMessage]);
                  toast.success(`Loaded ${data.length} rows from ${tableName}`);
                }}
              />
            </div>
          )}

          {/* CSV Info Display for Data Analysis Mode */}
          {dataAnalysisMode && csvInfo.has_csv && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Dataset: {csvInfo.filename}
                  </span>
                </div>
                <div className="text-sm text-green-600">
                  {csvInfo.shape?.[0]} rows × {csvInfo.shape?.[1]} columns
                </div>
              </div>
              {csvInfo.columns && (
                <div className="mt-2 text-xs text-green-700">
                  <strong>Columns:</strong> {csvInfo.columns.join(', ')}
                </div>
              )}
            </div>
          )}
          
          {/* DB Loaded Data Info */}
          {dataAnalysisMode && dbLoadedData && !showDatabaseManager && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    Database Data Loaded
                  </span>
                </div>
                <div className="text-sm text-blue-600">
                  {dbLoadedData.length} rows
                </div>
              </div>
              {dbLoadedData.length > 0 && (
                <div className="mt-2 text-xs text-blue-700">
                  <strong>Columns:</strong> {Object.keys(dbLoadedData[0]).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Enhanced File Upload Area */}
          {(uploadedFiles.length > 0 || uploadedFileInfos.length > 0) && !dataAnalysisMode && (
            <div className="flex flex-wrap gap-2">
              {/* Current upload queue */}
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-600">
                  {fileTypeIcon(file.name)}
                  <span className="text-sm text-slate-300 truncate max-w-32">{file.name}</span>
                  <button
                    onClick={() => setUploadedFiles(prev => prev.filter(f => f.name !== file.name))}
                    className="text-slate-400 hover:text-red-400 ml-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              
              {/* Previously uploaded files */}
              {uploadedFileInfos.map((file, index) => (
                <div key={`uploaded-${index}`} className="flex items-center gap-2 bg-green-100 rounded-lg px-3 py-2 border border-green-300">
                  {fileTypeIcon(file.filename)}
                  <span className="text-sm text-green-700 truncate max-w-32">{file.filename}</span>
                  <span className="text-xs text-green-500 ml-auto">
                    {new Date(file.uploaded_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Controls */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              {!dataAnalysisMode && (
                <>
                  {/* Chain Mode Toggle */}
                  <div className="flex items-center gap-3">
                    <Switch
                      id="chain-mode"
                      checked={chainMode}
                      onCheckedChange={setChainMode}
                      className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-[#B983FD] data-[state=unchecked]:border-gray-300 data-[state=checked]:border-[#B983FD]"
                    />
                    <Label htmlFor="chain-mode" className="text-sm font-medium cursor-pointer" style={{ color: '#181C5A' }}>
                      Chain Mode
                    </Label>
                  </div>
                  
                  {/* Web Search Toggle */}
                  {webSearchEnabledGlobally && (
                    <div className="flex items-center gap-3">
                      <Switch
                        id="web-search"
                        checked={useWebSearch}
                        onCheckedChange={setUseWebSearch}
                        className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-[#B983FD] data-[state=unchecked]:border-gray-300 data-[state=checked]:border-[#B983FD]"
                      />
                      <Label htmlFor="web-search" className="text-sm font-medium cursor-pointer flex items-center gap-2" style={{ color: '#181C5A' }}>
                        <span>🌐</span> Web Search
                      </Label>
                    </div>
                  )}
                  
                  {/* Chain Mode Warning */}
                  {chainMode && (!selectedChainModels[0] || !selectedChainModels[1]) && (
                    <Alert className="bg-amber-900/20 border-amber-600/50 text-amber-300">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Please add at least one model to the chain.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Model Selector */}
                  {!chainMode ? (
                    <ModelSelector
                      selectedModel={selectedModel}
                      onModelChange={(model) => setSelectedModel(model)}
                    />
                  ) : (
                    <DualChainModelSelector selectedModels={selectedChainModels} onModelsChange={setSelectedChainModels} />
                  )}
                </>
              )}

              {/* Data Analysis Model Selector and Upload Buttons */}
              {dataAnalysisMode && (
                <div className="flex items-center gap-3 flex-wrap w-full">
                  <Label className="text-sm font-medium" style={{ color: '#181C5A' }}>
                    Analysis Model:
                  </Label>
                  <Select value={selectedAnalysisModel} onValueChange={setSelectedAnalysisModel}>
                    <SelectTrigger className="w-[250px] bg-white border-[#A259FF] text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#A259FF]">
                      <SelectItem value="deepseek-coder-v2:latest" className="text-black">
                        DeepSeek Coder V2 (Recommended)
                      </SelectItem>
                      <SelectItem value="llama3.1:latest" className="text-black">
                        Llama 3.1
                      </SelectItem>
                      <SelectItem value="gemma3:270m" className="text-black">
                        Gemma 3 (270M)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Data Source Buttons */}
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={() => csvInputRef.current?.click()}
                      className="bg-white border-2 border-[#A259FF] text-[#181C5A] hover:bg-[#A259FF]/10 font-medium"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {csvInfo.has_csv ? 'Replace CSV' : 'Upload CSV'}
                    </Button>
                    
                    <Button
                      type="button"
                      size="default"
                      onClick={() => setShowDatabaseManager(!showDatabaseManager)}
                      className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium shadow-md"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      {showDatabaseManager ? 'Hide DB' : 'Connect DB'}
                    </Button>
                  </div>
                </div>
              )}
              
              {/* OCR Controls */}
              {ocrMode && (
                <div className="flex items-center gap-3 flex-wrap w-full">
                  <Label className="text-sm font-medium" style={{ color: '#181C5A' }}>
                    OCR Language:
                  </Label>
                  <Select value={selectedOcrLanguage} onValueChange={setSelectedOcrLanguage}>
                    <SelectTrigger className="w-[200px] bg-white border-[#A259FF] text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#A259FF] max-h-[300px] overflow-y-auto">
                      {Object.entries(ocrLanguages).map(([code, name]) => (
                        <SelectItem key={code} value={code} className="text-black">
                          {name} ({code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Enhance Toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ocr-enhance"
                      checked={ocrEnhance}
                      onCheckedChange={setOcrEnhance}
                      className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-[#B983FD] data-[state=unchecked]:border-gray-300 data-[state=checked]:border-[#B983FD]"
                    />
                    <Label htmlFor="ocr-enhance" className="text-sm font-medium cursor-pointer" style={{ color: '#181C5A' }}>
                      Enhance Image
                    </Label>
                  </div>

                  {/* Upload Images Button */}
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={() => ocrInputRef.current?.click()}
                      className="bg-white border-2 border-[#A259FF] text-[#181C5A] hover:bg-[#A259FF]/10 font-medium"
                    >
                      <ScanText className="h-4 w-4 mr-2" />
                      {ocrFiles.length > 0 ? `${ocrFiles.length} Image(s) Selected` : 'Select Images'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Tools Panel */}
              {toolsMode && (
                <ToolsPanel
                  open={toolsPanelOpen}
                  selectedModel={selectedModel}
                  onOpenChange={(open) => {
                    setToolsPanelOpen(open);
                    if (!open) setToolsMode(false);
                  }}
                  onToolResult={(result, toolName) => {
                    console.log('Tool result:', toolName, result);
                    // Add tool result to messages
                    if (result) {
                      const toolMessage: Message = {
                        id: `tool-${Date.now()}`,
                        content: `**${toolName} Result:**\n\n${result}`,
                        isUser: false,
                        timestamp: new Date(),
                      };
                      setMessages(prev => [...prev, toolMessage]);
                    }
                    // Close the panel after getting result
                    setToolsPanelOpen(false);
                    setToolsMode(false);
                  }}
                />
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {/* CSV Upload and Database Connection Buttons for Data Analysis Mode - REMOVED FROM HERE */}
              {dataAnalysisMode && (
                <></>
              )}
              
              {!dataAnalysisMode && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startListening}
                    className={`h-8 w-8 p-0 text-slate-400 hover:text-[#B983FD] hover:bg-[#181C5A]/10 ${listening ? 'bg-[#B983FD]/20 text-[#181C5A]' : ''}`}
                    aria-label={listening ? "Stop voice input" : "Start voice input"}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-400 hover:text-[#B983FD] hover:bg-[#181C5A]/10"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </>
              )}
              
              <Button
                onClick={handleSend}
                disabled={
                  (!input.trim() && uploadedFiles.length === 0) || 
                  isLoading || 
                  (chainMode && (!selectedChainModels[0] || !selectedChainModels[1])) ||
                  (dataAnalysisMode && !csvInfo.has_csv && !dbLoadedData)
                }
                className="bg-gradient-to-r from-[#181C5A] to-[#B983FD] text-white border-0 h-10 w-10 rounded-[12px] shadow-md hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ml-2"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          {/* Input */}
          <div className="flex gap-3 items-center">
            <div className="flex-1 relative flex items-center">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={dataAnalysisMode 
                  ? csvInfo.has_csv 
                    ? "Ask questions about your dataset..." 
                    : "Please upload a CSV file first"
                  : "Type your message..."
                }
                className="min-h-[48px] max-h-40 pr-12 resize-none text-base bg-white border border-gray-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A259FF] focus-visible:outline-none rounded-2xl shadow-sm text-gray-900"
                disabled={isLoading || (dataAnalysisMode && !csvInfo.has_csv)}
                rows={1}
              />
              <div className="absolute right-2 flex items-center gap-1">
                {!dataAnalysisMode && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-full hover:bg-slate-200/50 text-slate-500 hover:text-slate-700 transition-colors"
                    disabled={isLoading}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={startListening}
                  className="p-1.5 rounded-full hover:bg-slate-200/50 text-slate-500 hover:text-slate-700 transition-colors"
                  disabled={isLoading}
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-shrink-0 flex items-center gap-2">
              <Button
                type="button"
                onClick={() => setIsDashboardOpen(true)}
                disabled={!dashboardHtml}
                className={`flex items-center gap-2 font-medium py-2 px-4 rounded-2xl shadow-lg transition-all duration-200 ${
                  dashboardHtml 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>

              <Button 
                onClick={handleSend} 
                disabled={isLoading || (!input.trim() && uploadedFiles.length === 0) || (dataAnalysisMode && !csvInfo.has_csv)}
                className="bg-gradient-to-r from-[#6C47FF] to-[#A259FF] hover:from-[#5A3BD9] hover:to-[#8C4DFF] text-white font-medium py-2 px-6 rounded-2xl shadow-lg transition-all duration-200 transform hover:scale-105"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{dataAnalysisMode ? 'Analyzing...' : 'Generating...'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    <span>{dataAnalysisMode ? 'Analyze' : 'Send'}</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
          
          {/* Hidden file inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx"
          />
          
          <input
            type="file"
            ref={csvInputRef}
            onChange={handleCSVUpload}
            className="hidden"
            accept=".csv,.xls,.xlsx"
          />
          
          {/* OCR Hidden Input */}
          <input
            type="file"
            ref={ocrInputRef}
            onChange={handleOCRUpload}
            className="hidden"
            multiple
            accept=".png,.jpg,.jpeg,.bmp,.tiff,.gif,.webp"
          />
      </div>
      {/* HTML Artifact Preview — OpenWebUI-style right slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-slate-950 border-l border-slate-700 shadow-2xl transition-all duration-300 ease-in-out ${
          isDashboardOpen ? 'w-[48vw] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-full pointer-events-none'
        }`}
        style={{ maxWidth: '900px', minWidth: isDashboardOpen ? '400px' : '0' }}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
            <span className="font-semibold text-white text-sm">HTML Preview</span>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">Live</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Open in new tab */}
            {dashboardHtml && (
              <button
                onClick={() => {
                  const blob = new Blob([dashboardHtml], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                title="Open in new tab"
              >
                ↗ New Tab
              </button>
            )}
            <button
              onClick={() => setIsDashboardOpen(false)}
              className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* iframe Renderer */}
        <div className="flex-1 bg-white overflow-auto">
          {dashboardHtml && isDashboardOpen && (
            <iframe
              key={dashboardHtml.slice(0, 50)} /* remount when html changes */
              srcDoc={dashboardHtml}
              className="w-full h-full border-none"
              title="HTML Artifact Preview"
              sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
            />
          )}
        </div>
      </div>
      <AnalyticsPanel open={analyticsPanelOpen} onClose={() => setAnalyticsPanelOpen(false)} />
    </div>
  );
};
