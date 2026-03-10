/**
 * ChatWidget Types
 * Pre-scripted conversational flow for form filling
 */

export interface ChatMessage {
  id: string;
  type: 'bot' | 'user' | 'system';
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
  /** Section of the form data (e.g., 'personal', 'location', 'academic', 'course') */
  section?: string;
  /** Sub-section for nested JSONB data (e.g., 'schoolStudentData', 'diplomaStudentData') */
  subSection?: string;
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
  onFieldUpdate: (fieldName: string, value: unknown, section?: string, subSection?: string) => void;
  onComplete: () => void;
  /** Display mode: 'floating' shows FAB + popup, 'panel' renders inline filling parent container */
  displayMode?: 'floating' | 'panel';
  position?: 'right' | 'left';
  title?: string;
  subtitle?: string;
  avatarUrl?: string;
  /** Show "Connect to Office" option in chat */
  showConnectToOffice?: boolean;
  /** Callback when user wants to connect to office */
  onConnectToOffice?: () => void;
}
