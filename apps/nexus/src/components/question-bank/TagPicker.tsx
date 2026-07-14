'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Autocomplete, TextField, Chip, Box, CircularProgress } from '@neram/ui';
import type { NexusQBTag, NexusQBTagGroup } from '@neram/database';

const GROUP_LABEL: Record<NexusQBTagGroup, string> = {
  exam: 'Exam',
  subject: 'Subject',
  theme: 'Theme',
};

interface TagOption extends Partial<NexusQBTag> {
  id: string;
  label: string;
  group_type: NexusQBTagGroup;
  __create?: boolean;
  inputLabel?: string;
}

interface TagPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  getToken: () => Promise<string | null>;
  /** Allow teachers to create a new (theme) tag inline. */
  allowCreate?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Grouped multi-select tag picker (Exam / Subject / Theme) with type-ahead
 * and optional inline "create" for teachers. Emits the selected tag ids.
 */
export default function TagPicker({
  value,
  onChange,
  getToken,
  allowCreate = false,
  label = 'Tags',
  placeholder = 'Search tags',
  disabled,
}: TagPickerProps) {
  const [options, setOptions] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [creating, setCreating] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tags', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json();
        const opts: TagOption[] = (json.data || []).map((t: NexusQBTag) => ({
          ...t,
          id: t.id,
          label: t.label,
          group_type: t.group_type,
        }));
        setOptions(opts);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const selected = useMemo(
    () => value.map((id) => options.find((o) => o.id === id)).filter(Boolean) as TagOption[],
    [value, options],
  );

  async function createThemeTag(labelText: string): Promise<TagOption | null> {
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return null;
      const res = await fetch('/api/question-bank/tags', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_type: 'theme', label: labelText.trim() }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const created: TagOption = { ...json.data, id: json.data.id, label: json.data.label, group_type: json.data.group_type };
      setOptions((prev) => [...prev, created]);
      return created;
    } finally {
      setCreating(false);
    }
  }

  return (
    <Autocomplete
      multiple
      disabled={disabled}
      loading={loading}
      options={options}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      groupBy={(o) => GROUP_LABEL[o.group_type]}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.__create ? `Create "${o.inputLabel}"` : o.label)}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      filterSelectedOptions
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        const filtered = opts.filter((o) => o.label.toLowerCase().includes(q));
        if (allowCreate && q.length > 1 && !opts.some((o) => o.label.toLowerCase() === q)) {
          filtered.push({ id: `__create__${q}`, label: q, group_type: 'theme', __create: true, inputLabel: state.inputValue.trim() });
        }
        return filtered;
      }}
      onChange={async (_, newValue) => {
        const resolved: TagOption[] = [];
        for (const item of newValue as TagOption[]) {
          if (item.__create) {
            const created = await createThemeTag(item.inputLabel || item.label);
            if (created) resolved.push(created);
          } else {
            resolved.push(item);
          }
        }
        onChange(resolved.map((o) => o.id));
        setInputValue('');
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.id}
            label={option.label}
            size="small"
            sx={{ height: 26 }}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selected.length === 0 ? placeholder : undefined}
          size="small"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {(loading || creating) && <CircularProgress color="inherit" size={16} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id} sx={{ fontStyle: option.__create ? 'italic' : 'normal' }}>
          {option.__create ? `Create theme tag "${option.inputLabel}"` : option.label}
        </Box>
      )}
    />
  );
}
