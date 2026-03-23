'use client';

import { useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Chip,
  CircularProgress,
} from '@neram/ui';

interface UsernameSectionProps {
  currentUsername: string | null;
  username: string;
  setUsername: (v: string) => void;
  usernameAvailable: boolean | null;
  setUsernameAvailable: (v: boolean | null) => void;
  usernameSuggestions: string[];
  setUsernameSuggestions: (v: string[]) => void;
  checkingUsername: boolean;
  checkUsernameAvailability: (v: string) => void;
  handleSetUsername: () => void;
  saving: boolean;
}

export default function UsernameSection({
  currentUsername,
  username,
  setUsername,
  usernameAvailable,
  setUsernameAvailable,
  usernameSuggestions,
  setUsernameSuggestions,
  checkingUsername,
  checkUsernameAvailability,
  handleSetUsername,
  saving,
}: UsernameSectionProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedCheck = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        checkUsernameAvailability(value);
      }, 400);
    },
    [checkUsernameAvailability]
  );

  if (currentUsername) {
    return (
      <Box>
        <Typography variant="body1">
          Your username: <strong>@{currentUsername}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          You can use this username to login instead of your email.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Set a unique username to login more easily
      </Typography>
      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => {
              const value = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '');
              setUsername(value);
              debouncedCheck(value);
            }}
            placeholder="e.g., john_doe"
            helperText={
              checkingUsername
                ? 'Checking...'
                : usernameAvailable === true
                ? 'Username is available!'
                : usernameAvailable === false
                ? 'Username is taken'
                : '3-30 characters, letters, numbers, underscores, dots'
            }
            error={usernameAvailable === false}
            InputProps={{
              endAdornment: checkingUsername ? <CircularProgress size={20} /> : null,
            }}
          />
          {usernameSuggestions.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Suggestions:{' '}
                {usernameSuggestions.map((s, i) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    onClick={() => {
                      setUsername(s);
                      setUsernameAvailable(true);
                      setUsernameSuggestions([]);
                    }}
                    sx={{ ml: i > 0 ? 0.5 : 0, cursor: 'pointer' }}
                  />
                ))}
              </Typography>
            </Box>
          )}
        </Grid>
        <Grid item xs={12} sm={4}>
          <Button
            variant="contained"
            fullWidth
            onClick={handleSetUsername}
            disabled={!usernameAvailable || saving || username.length < 3}
            sx={{ height: 56 }}
          >
            {saving ? <CircularProgress size={24} /> : 'Set Username'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
