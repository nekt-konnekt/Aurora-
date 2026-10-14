export interface UserProfile {
  occupation: string;
  focus: string;
  registeredAt: number;
}

export interface ActionItem {
  id?: string;
  text: string;
  done: boolean;
}

export interface NoteSection {
  title: string;
  content: string;
}

export interface VoiceNote {
  id: string;
  title: string;
  transcript: string;
  summary: string;
  intent: string;
  sections: NoteSection[];
  actionItems: ActionItem[];
  duration: number;
  audioBlob?: Blob;
  audioUrl?: string;
  createdAt: number;
  aiProvider?: string;
  aiModel?: string;
}

export interface AIProviderInfo {
  name: string;
  provider: 'gemini' | 'openai' | 'ollama' | 'qwen' | 'openrouter' | 'groq' | 'custom';
  status: 'active' | 'ready' | 'missing_key' | 'disabled' | 'error';
  model?: string;
  audioModel?: string;
  baseUrl?: string;
  isFallback?: boolean;
}

export interface AIProvidersResponse {
  primary: AIProviderInfo;
  fallback: AIProviderInfo;
  autoFailover: boolean;
  activeProviderInUse: string;
}
