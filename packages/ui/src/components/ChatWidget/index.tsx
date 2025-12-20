'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  TextField,
  Button,
  Fab,
  Zoom,
  Avatar,
  Chip,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { ChatWidgetProps, ChatMessage, ChatStep } from './types';

export * from './types';

export function ChatWidget({
  flowConfig,
  formData,
  onFieldUpdate,
  onComplete,
  position = 'right',
  title = 'Nera',
  subtitle = 'Application Assistant',
  avatarUrl,
}: ChatWidgetProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addBotMessage = useCallback((content: string, delay: number = 0) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}-${Math.random()}`,
            type: 'bot',
            content,
            timestamp: new Date(),
          },
        ]);
        resolve();
      }, delay);
    });
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        type: 'user',
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Start chat with welcome messages
  const startChat = useCallback(async () => {
    setIsTyping(true);
    for (let i = 0; i < flowConfig.welcomeMessages.length; i++) {
      await addBotMessage(flowConfig.welcomeMessages[i], i === 0 ? 500 : 800);
    }
    setIsTyping(false);
    setCurrentStepIndex(0);
  }, [flowConfig.welcomeMessages, addBotMessage]);

  // Show current step's bot messages
  useEffect(() => {
    if (currentStepIndex < 0 || currentStepIndex >= flowConfig.steps.length) return;

    const step = flowConfig.steps[currentStepIndex];

    // Check skip condition
    if (step.skipCondition && step.skipCondition(formData)) {
      setCurrentStepIndex((prev) => prev + 1);
      return;
    }

    const showStepMessages = async () => {
      setIsTyping(true);
      for (let i = 0; i < step.botMessages.length; i++) {
        await addBotMessage(step.botMessages[i], 600);
      }
      setIsTyping(false);
    };

    showStepMessages();
  }, [currentStepIndex, flowConfig.steps, formData, addBotMessage]);

  // Handle completion
  useEffect(() => {
    if (currentStepIndex >= flowConfig.steps.length && !isComplete) {
      const showCompletionMessages = async () => {
        setIsTyping(true);
        for (let i = 0; i < flowConfig.completionMessages.length; i++) {
          await addBotMessage(flowConfig.completionMessages[i], 600);
        }
        setIsTyping(false);
        setIsComplete(true);
        onComplete();
      };
      showCompletionMessages();
    }
  }, [currentStepIndex, flowConfig, isComplete, addBotMessage, onComplete]);

  const validateInput = (value: string, step: ChatStep): boolean => {
    const { validation } = step.inputConfig;
    if (!validation) return true;

    if (validation.required && !value.trim()) return false;
    if (validation.minLength && value.length < validation.minLength) return false;
    if (validation.maxLength && value.length > validation.maxLength) return false;
    if (validation.pattern && !validation.pattern.test(value)) return false;

    return true;
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || currentStepIndex < 0) return;

    const step = flowConfig.steps[currentStepIndex];
    const value = inputValue.trim();

    // Add user message
    const displayValue = step.inputConfig.options
      ? step.inputConfig.options.find((o) => o.value === value)?.label || value
      : value;
    addUserMessage(displayValue);

    // Validate
    const isValid = validateInput(value, step);

    if (isValid) {
      // Update form data
      onFieldUpdate(step.fieldName, value);

      // Show response
      setIsTyping(true);
      const response = typeof step.responses.valid === 'function'
        ? step.responses.valid(value)
        : step.responses.valid.replace('{{value}}', displayValue);
      await addBotMessage(response, 500);
      setIsTyping(false);

      // Move to next step
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Show invalid response
      if (step.responses.invalid) {
        setIsTyping(true);
        await addBotMessage(step.responses.invalid, 500);
        setIsTyping(false);
      }
    }

    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (messages.length === 0) {
      startChat();
    }
  };

  const currentStep = currentStepIndex >= 0 && currentStepIndex < flowConfig.steps.length
    ? flowConfig.steps[currentStepIndex]
    : null;

  return (
    <>
      {/* Floating Button */}
      <Zoom in={!isOpen}>
        <Fab
          color="primary"
          onClick={handleOpen}
          sx={{
            position: 'fixed',
            bottom: 24,
            [position]: 24,
            zIndex: 1000,
          }}
        >
          <ChatIcon />
        </Fab>
      </Zoom>

      {/* Chat Window */}
      <Zoom in={isOpen}>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 24,
            [position]: 24,
            width: { xs: 'calc(100vw - 32px)', sm: 380 },
            maxWidth: 380,
            height: { xs: 'calc(100vh - 120px)', sm: 520 },
            maxHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Avatar
              src={avatarUrl}
              sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}
            >
              <SmartToyIcon />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {title}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                {subtitle}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => setIsOpen(false)}
              sx={{ color: 'white' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              bgcolor: '#f5f5f5',
            }}
          >
            {messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1.5,
                }}
              >
                <Box
                  sx={{
                    maxWidth: '80%',
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: message.type === 'user' ? 'primary.main' : 'white',
                    color: message.type === 'user' ? 'white' : 'text.primary',
                    boxShadow: 1,
                  }}
                >
                  <Typography variant="body2">{message.content}</Typography>
                </Box>
              </Box>
            ))}

            {isTyping && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1.5 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'white',
                    boxShadow: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: 'grey.400',
                          animation: 'bounce 1.4s infinite',
                          animationDelay: `${i * 0.2}s`,
                          '@keyframes bounce': {
                            '0%, 80%, 100%': { transform: 'scale(0)' },
                            '40%': { transform: 'scale(1)' },
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          {currentStep && !isComplete && (
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'white' }}>
              {currentStep.inputConfig.type === 'select' ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {currentStep.inputConfig.options?.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      onClick={() => {
                        setInputValue(option.value);
                        setTimeout(() => {
                          setInputValue('');
                          addUserMessage(option.label);
                          onFieldUpdate(currentStep.fieldName, option.value);
                          setIsTyping(true);
                          const response = typeof currentStep.responses.valid === 'function'
                            ? currentStep.responses.valid(option.value)
                            : currentStep.responses.valid.replace('{{value}}', option.label);
                          addBotMessage(response, 500).then(() => {
                            setIsTyping(false);
                            setCurrentStepIndex((prev) => prev + 1);
                          });
                        }, 100);
                      }}
                      sx={{ cursor: 'pointer' }}
                      color="primary"
                      variant={inputValue === option.value ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={currentStep.inputConfig.placeholder || 'Type your answer...'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    type={
                      currentStep.inputConfig.type === 'email' ? 'email' :
                      currentStep.inputConfig.type === 'phone' ? 'tel' :
                      currentStep.inputConfig.type === 'number' ? 'number' :
                      currentStep.inputConfig.type === 'date' ? 'date' :
                      'text'
                    }
                    disabled={isTyping}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                      },
                    }}
                  />
                  <IconButton
                    color="primary"
                    onClick={handleSubmit}
                    disabled={!inputValue.trim() || isTyping}
                  >
                    <SendIcon />
                  </IconButton>
                </Box>
              )}
            </Box>
          )}

          {isComplete && (
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'white', textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Chat complete! Review your application above.
              </Typography>
            </Box>
          )}
        </Paper>
      </Zoom>
    </>
  );
}

export default ChatWidget;
