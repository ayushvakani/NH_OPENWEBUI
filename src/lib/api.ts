// API service for communicating with the FastAPI backend

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Token management functions - defined early so they're available to all API functions
export function getToken() {
  // Get token from localStorage (set during login)
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function removeToken() {
  localStorage.removeItem('token');
}

// Cache for user info (set when /me is called)
let cachedUserInfo: { username: string; role: string } | null = null;

export function setCachedUserInfo(info: { username: string; role: string } | null) {
  cachedUserInfo = info;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // milliseconds

// Helper function to retry fetch requests
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Fetch failed, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.5); // Exponential backoff
    }
    throw error;
  }
}

export interface PromptInput {
  prompt: string;
  model: string;
}

export interface ApiResponse {
  model: string;
  response: string;
}

export interface ChainRequest {
  prompt: string;
  models: string[];
}

export interface ChainResponse {
  responses: Array<{
    model: string;
    response: string;
  }>;
}

export interface ChatMessageRequest {
  prompt: string;
  response: string;
}

export interface ChatMessageResponse {
  id: number;
  prompt: string;
  response: string;
  timestamp: string;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Single model request
  async askModel(prompt: string, model: string, session_id?: string): Promise<ApiResponse> {
    try {
      const token = getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${this.baseUrl}/ask`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          model,
          session_id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error calling API:', error);
      throw error;
    }
  }
  
  // Health check to verify backend connectivity
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export the class for testing or custom instances
export { ApiService };

export async function chainModelsAPI(prompt: string, models: string[]) {
  const response = await fetch(`${API_BASE_URL}/chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, models }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
// Add this function to your api.ts
export async function analyzeDataAPI(prompt: string, sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/analyze-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      prompt,
      model: 'data-analysis',
      session_id: sessionId,
    }),
  });
  
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// Enhanced streaming single model request with search
export async function* askModelStreamWithSearch(
  prompt: string, 
  model: string, 
  session_id?: string, 
  token?: string, 
  signal?: AbortSignal,
  use_web_search: boolean = true
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Create an AbortController with a 10-minute timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes
  
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ prompt, model, session_id, use_web_search }),
      signal: signal || controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    // Clear the timeout if the request completes successfully
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out after 10 minutes');
    }
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          yield parsed;
        } catch (e) {
          console.error('Failed to parse streaming response:', e);
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (e) {
      console.error('Failed to parse final buffer:', e);
    }
  }
}

export async function uploadFilesAPI(files: File[], sessionId: string) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  const response = await fetch(`${API_BASE_URL}/upload?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// Tavily-powered search endpoints
export async function searchYouTubeAPI(query: string, maxResults: number = 5) {
  const response = await fetch(`${API_BASE_URL}/search/youtube?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function searchRedditAPI(query: string, maxResults: number = 5) {
  const response = await fetch(`${API_BASE_URL}/search/reddit?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function searchAcademicAPI(query: string, maxResults: number = 5) {
  const response = await fetch(`${API_BASE_URL}/search/academic?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function searchCryptoAPI(query: string, maxResults: number = 5) {
  const response = await fetch(`${API_BASE_URL}/search/crypto?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// OCR API Functions
export interface OCRLanguages {
  languages: Record<string, string>;
  total: number;
}

export async function getOCRLanguagesAPI(): Promise<OCRLanguages> {
  const response = await fetch(`${API_BASE_URL}/ocr/languages`, {
    method: 'GET',
    credentials: 'include',
  });
  
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<OCRLanguages>;
}

export interface OCRResult {
  text?: string;
  ocr_data?: {
    text: string;
    confidence: number;
    languages_used: string;
    success: boolean;
  };
  filename: string;
  languages: string;
  enhance: boolean;
}

export async function performOCRAPI(
  file: File,
  languages: string = "eng",
  enhance: boolean = true,
  outputFormat: string = "text"
): Promise<OCRResult> {
  const formData = new FormData();
  formData.append('file', file);
  
  const params = new URLSearchParams({
    languages,
    enhance: enhance.toString(),
    output_format: outputFormat,
  });
  
  const response = await fetch(`${API_BASE_URL}/ocr?${params}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `OCR failed: ${response.status}`);
  }
  
  return response.json() as Promise<OCRResult>;
}

export interface BatchOCRResult {
  filename: string;
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

export interface BatchOCRResponse {
  results: BatchOCRResult[];
  total: number;
  successful: number;
}

export async function performBatchOCRAPI(
  files: File[],
  languages: string = "eng",
  enhance: boolean = true
): Promise<BatchOCRResponse> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  
  const params = new URLSearchParams({
    languages,
    enhance: enhance.toString(),
  });
  
  const response = await fetch(`${API_BASE_URL}/ocr/batch?${params}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<BatchOCRResponse>;
}

export async function getChatHistoryAPI(session_id: string) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/history?session_id=${encodeURIComponent(session_id)}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<ChatMessageResponse[]>;
}

export async function listChatSessionsAPI() {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}/chat-sessions`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    
    console.log('Chat sessions response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch chat sessions:', response.status, errorText.substring(0, 200));
      
      // If endpoint doesn't exist (404), return empty array as fallback
      if (response.status === 404) {
        console.warn('Chat sessions endpoint not found, returning empty array');
        return [];
      }
      
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Response is not JSON:', contentType);
      const text = await response.text();
      console.error('Response body:', text.substring(0, 200));
      return []; // Return empty array instead of throwing
    }
    
    const data = await response.json();
    console.log('Chat sessions API response:', data);
    return data as Array<{ session_id: string; last_message: string; timestamp: string }>;
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    // Return empty array on any error to prevent infinite loading
    return [];
  }
}

export async function saveChatMessageAPI(session_id: string, prompt: string, responseText: string, model_used?: string) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/history`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ session_id, prompt, response: responseText, model_used }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<ChatMessageResponse>;
}

export function getUserInfo() {
  // Get user info from cached value (set when /me is called)
  return cachedUserInfo;
}

export function isAuthenticated() {
  // Check if we have a token
  const token = getToken();
  return !!token;
}

export async function logoutAPI() {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/logout`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });
  if (!response.ok) throw new Error(await response.text());
  // Clear token from localStorage
  removeToken();
  return response.json();
}

// Fetch user info from /me endpoint
export async function fetchUserInfo(): Promise<{ username: string; role: string } | null> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/me`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    setCachedUserInfo(data);
    return data;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}

// Helper function for authenticated API requests
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `API request failed: ${response.status}`);
  }
  
  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Streaming single model request
export async function* askModelStream(prompt: string, model: string, session_id?: string, token?: string, signal?: AbortSignal) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ prompt, model, session_id }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`API request failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

// Streaming chain model request
export async function* chainModelsStream(prompt: string, models: string[], token?: string, signal?: AbortSignal) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}/chain`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ prompt, models }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`API request failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
} 
