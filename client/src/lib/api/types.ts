export type VoiceGender = 'FEMALE' | 'MALE';
export type MemoryMode = 'NONE' | 'SESSION' | 'PERSONAL';
export type InteractionMode = 'VOICE' | 'TEXT' | 'BOTH';
export type ResponseStyle = 'LISTEN' | 'SOLUTIONS' | 'BALANCED';
export type TextSize = 'md' | 'lg' | 'xl';
export type MemoryCategory = 'PREFERENCE' | 'PEOPLE' | 'ROUTINE' | 'WELLBEING' | 'GOAL' | 'OTHER';
export type MemoryKind = 'STATED' | 'INTERPRETATION';
export type Mood = 'carrying' | 'tired' | 'peaceful' | 'need_to_talk';

export interface Preferences {
  responseStyle: ResponseStyle;
  historyEnabled: boolean;
  codeMixing: boolean;
  voiceOutputEnabled: boolean;
  voiceRate: number;
  /** Anbu's voice: female unless she chooses male. */
  voiceGender: VoiceGender;
  voiceInputReview: boolean;
  captionsEnabled: boolean;
  reducedMotion: boolean;
  textSize: TextSize;
  highContrast: boolean;
  dailyPromptEnabled: boolean;
  analyticsConsent: boolean;
}

export interface PersistencePolicy {
  mode: MemoryMode;
  transcripts: boolean;
  memories: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferredLanguage: string;
  interactionMode: InteractionMode;
  memoryMode: MemoryMode;
  onboardingCompleted: boolean;
  createdAt: string;
  preferences: Preferences;
  persistence: PersistencePolicy;
}

export interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface PrivacySettings {
  memoryMode: MemoryMode;
  historyEnabled: boolean;
  analyticsConsent: boolean;
  persistence: PersistencePolicy;
  stored: { conversations: number; memories: number };
}

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  kind: MemoryKind;
  sensitive: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoredMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  language: string;
  createdAt: string;
}

export interface ConversationDetail extends Omit<ConversationSummary, 'messageCount'> {
  messages: StoredMessage[];
}

export type SafetyCategory = 'self_harm' | 'abuse' | 'harm_to_others' | 'medical';

export interface SupportResource {
  id: 'emergency' | 'telemanas' | 'women_helpline';
  phone: string;
  altPhone?: string;
}

export interface SafetyInfo {
  level: 'none' | 'concern' | 'urgent';
  categories: SafetyCategory[];
  resources: SupportResource[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemorySuggestion {
  content: string;
  category: MemoryCategory;
  kind: MemoryKind;
  sensitive: boolean;
}

export interface Health {
  status: string;
  database: string;
  ai: { provider: string; mock: boolean };
  /** natural: the server can speak replies in a natural voice. */
  voice?: { natural: boolean };
  languages: string[];
}
