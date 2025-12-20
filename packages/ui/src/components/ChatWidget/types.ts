/**
 * ChatWidget Types
 * Pre-scripted conversational flow for form filling
 */

export interface ChatMessage {
  id: string;
  type: 'bot' | 'user';
  content: string;
  timestamp: Date;
}

export interface ChatInputConfig {
  type: 'text' | 'email' | 'phone' | 'date' | 'select' | 'multiselect' | 'number';
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    min?: number;
    max?: number;
  };
}

export interface ChatStep {
  id: string;
  fieldName: string;
  botMessages: string[]; // Messages to show before input
  inputConfig: ChatInputConfig;
  responses: {
    valid: string | ((value: string) => string);
    invalid?: string;
  };
  skipCondition?: (formData: Record<string, unknown>) => boolean;
}

export interface ChatFlowConfig {
  welcomeMessages: string[];
  steps: ChatStep[];
  completionMessages: string[];
}

export interface ChatWidgetProps {
  flowConfig: ChatFlowConfig;
  formData: Record<string, unknown>;
  onFieldUpdate: (fieldName: string, value: unknown) => void;
  onComplete: () => void;
  position?: 'right' | 'left';
  title?: string;
  subtitle?: string;
  avatarUrl?: string;
}
