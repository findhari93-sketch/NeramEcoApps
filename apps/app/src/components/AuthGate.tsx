'use client';

import { useState, useEffect, ReactNode } from 'react';
import { Box, Typography, Button, Paper, CircularProgress } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ToolAuthModal from './ToolAuthModal';

interface AuthGateProps {
  children: ReactNode;
  /** Data to persist while user authenticates */
  pendingData?: Record<string, unknown>;
  /** Callback when user successfully authenticates */
  onAuthenticated?: () => void;
  /** Custom title for the gate */
  title?: string;
  /** Custom description for the gate */
  description?: string;
  /** Whether there's data to show (only show gate if there's pending results) */
  hasData?: boolean;
}

const PENDING_DATA_KEY = 'neram_tool_pending_data';

export function AuthGate({
  children,
  pendingData,
  onAuthenticated,
  title = 'Sign up to see your results',
  description = 'Create a free account to access your personalized results and save them for later.',
  hasData = true,
}: AuthGateProps) {
  const { user, loading } = useFirebaseAuth();
  const [showModal, setShowModal] = useState(false);
  const [hasCalledCallback, setHasCalledCallback] = useState(false);

  // Save pending data when gate is shown
  useEffect(() => {
    if (pendingData && !user && hasData) {
      sessionStorage.setItem(PENDING_DATA_KEY, JSON.stringify(pendingData));
    }
  }, [pendingData, user, hasData]);

  // Call onAuthenticated callback when user signs in
  useEffect(() => {
    if (user && hasData && onAuthenticated && !hasCalledCallback) {
      setHasCalledCallback(true);
      // Small delay to ensure everything is ready
      setTimeout(() => {
        onAuthenticated();
      }, 100);
    }
  }, [user, hasData, onAuthenticated, hasCalledCallback]);

  // Clear pending data when authenticated
  useEffect(() => {
    if (user) {
      sessionStorage.removeItem(PENDING_DATA_KEY);
    }
  }, [user]);

  if (loading) {
    return (
      <Paper
        sx={{
          p: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
        }}
      >
        <CircularProgress />
      </Paper>
    );
  }

  // If not showing results or user is authenticated, show children
  if (!hasData || user) {
    return <>{children}</>;
  }

  // Show auth gate
  return (
    <>
      <Paper
        sx={{
          p: { xs: 3, md: 4 },
          textAlign: 'center',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
          border: '2px dashed',
          borderColor: 'primary.light',
        }}
      >
        <Box sx={{ mb: 3 }}>
          <Typography variant="h2" sx={{ fontSize: '3rem', mb: 1 }}>
            🔒
          </Typography>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            {description}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => setShowModal(true)}
            sx={{ minWidth: 200 }}
          >
            Continue with Phone
          </Button>
          <Typography variant="body2" color="text.secondary">
            Free forever. No credit card required.
          </Typography>
        </Box>

        {/* Benefits */}
        <Box
          sx={{
            mt: 4,
            pt: 3,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          {[
            { icon: '📊', text: 'Save your results' },
            { icon: '🔔', text: 'Get exam updates' },
            { icon: '🎯', text: 'Personalized tips' },
          ].map((benefit) => (
            <Box key={benefit.text} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '1.2rem' }}>{benefit.icon}</span>
              <Typography variant="body2" color="text.secondary">
                {benefit.text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <ToolAuthModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          if (onAuthenticated) {
            onAuthenticated();
          }
        }}
      />
    </>
  );
}

/**
 * Hook to get pending data after authentication
 */
export function usePendingToolData<T = Record<string, unknown>>(): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(PENDING_DATA_KEY);
    if (stored) {
      try {
        setData(JSON.parse(stored));
        sessionStorage.removeItem(PENDING_DATA_KEY);
      } catch {
        setData(null);
      }
    }
  }, []);

  return data;
}

export default AuthGate;
