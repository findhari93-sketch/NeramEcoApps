'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Select,
  MenuItem,
  IconButton,
  Button,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import type {
  CoursePlanCSVData,
  CSVSessionRow,
  CSVWeekRow,
  CSVTestRow,
  CSVDrillRow,
  CSVResourceRow,
  TeacherMapping,
} from '@/lib/course-plan-csv-schema';

interface ReviewStepProps {
  data: CoursePlanCSVData;
  onChange: (updated: CoursePlanCSVData) => void;
  teacherMappings: TeacherMapping[];
}

export default function ReviewStep({
  data,
  onChange,
  teacherMappings,
}: ReviewStepProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Group sessions by week
  const sessionsByWeek = new Map<number, CSVSessionRow[]>();
  for (const session of data.sessions) {
    const existing = sessionsByWeek.get(session.week) || [];
    existing.push(session);
    sessionsByWeek.set(session.week, existing);
  }
  const weekNumbers = Array.from(sessionsByWeek.keys()).sort((a, b) => a - b);

  // Session counts
  const totalSessions = data.sessions.length;
  const sessionsWithTitles = data.sessions.filter((s) => s.title).length;
  const sessionsWithHomework = data.sessions.filter((s) => s.homework).length;

  // Helpers to update nested data immutably
  const updateSession = useCallback(
    (weekNum: number, sessionIdx: number, field: keyof CSVSessionRow, value: string | number | null) => {
      const updated = { ...data };
      updated.sessions = [...data.sessions];
      // Find the actual index in the flat sessions array
      let count = 0;
      for (let i = 0; i < updated.sessions.length; i++) {
        if (updated.sessions[i].week === weekNum) {
          if (count === sessionIdx) {
            updated.sessions[i] = { ...updated.sessions[i], [field]: value };
            break;
          }
          count++;
        }
      }
      onChange(updated);
    },
    [data, onChange]
  );

  const updateWeek = useCallback(
    (idx: number, field: keyof CSVWeekRow, value: string | number) => {
      const updated = { ...data };
      updated.weeks = [...data.weeks];
      updated.weeks[idx] = { ...updated.weeks[idx], [field]: value };
      onChange(updated);
    },
    [data, onChange]
  );

  const updateTest = useCallback(
    (idx: number, field: keyof CSVTestRow, value: string | number) => {
      const updated = { ...data };
      updated.tests = [...data.tests];
      updated.tests[idx] = { ...updated.tests[idx], [field]: value };
      onChange(updated);
    },
    [data, onChange]
  );

  const removeTest = useCallback(
    (idx: number) => {
      const updated = { ...data };
      updated.tests = data.tests.filter((_, i) => i !== idx);
      onChange(updated);
    },
    [data, onChange]
  );

  const addTest = useCallback(() => {
    const updated = { ...data };
    updated.tests = [
      ...data.tests,
      { week: 1, title: '', questions: 0, duration: 0, scope: '' },
    ];
    onChange(updated);
  }, [data, onChange]);

  const updateDrill = useCallback(
    (idx: number, field: keyof CSVDrillRow, value: string) => {
      const updated = { ...data };
      updated.drills = [...data.drills];
      updated.drills[idx] = { ...updated.drills[idx], [field]: value };
      onChange(updated);
    },
    [data, onChange]
  );

  const removeDrill = useCallback(
    (idx: number) => {
      const updated = { ...data };
      updated.drills = data.drills.filter((_, i) => i !== idx);
      onChange(updated);
    },
    [data, onChange]
  );

  const addDrill = useCallback(() => {
    const updated = { ...data };
    updated.drills = [
      ...data.drills,
      { question: '', answer: '', explanation: '', frequency: '' },
    ];
    onChange(updated);
  }, [data, onChange]);

  const updateResource = useCallback(
    (idx: number, field: keyof CSVResourceRow, value: string) => {
      const updated = { ...data };
      updated.resources = [...data.resources];
      updated.resources[idx] = { ...updated.resources[idx], [field]: value };
      onChange(updated);
    },
    [data, onChange]
  );

  const removeResource = useCallback(
    (idx: number) => {
      const updated = { ...data };
      updated.resources = data.resources.filter((_, i) => i !== idx);
      onChange(updated);
    },
    [data, onChange]
  );

  const addResource = useCallback(() => {
    const updated = { ...data };
    updated.resources = [
      ...data.resources,
      { title: '', url: '', type: 'reference' },
    ];
    onChange(updated);
  }, [data, onChange]);

  return (
    <Box>
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.85rem',
            minHeight: 48,
          },
        }}
      >
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Sessions
              <Chip
                label={totalSessions}
                size="small"
                color="primary"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          }
        />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Weeks
              <Chip
                label={data.weeks.length}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          }
        />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Tests
              <Chip
                label={data.tests.length}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          }
        />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Drills
              <Chip
                label={data.drills.length}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          }
        />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Resources
              <Chip
                label={data.resources.length}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          }
        />
      </Tabs>

      {/* Sessions Tab */}
      {activeTab === 0 && (
        <Box>
          {/* Summary chips */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              mb: 2,
            }}
          >
            <Chip
              label={`${totalSessions} sessions`}
              size="small"
              color="primary"
            />
            <Chip
              label={`${sessionsWithTitles} with titles`}
              size="small"
              color={sessionsWithTitles === totalSessions ? 'success' : 'default'}
              variant="outlined"
            />
            <Chip
              label={`${sessionsWithHomework} with homework`}
              size="small"
              variant="outlined"
            />
          </Box>

          {/* Sessions grouped by week */}
          {weekNumbers.map((weekNum) => {
            const weekSessions = sessionsByWeek.get(weekNum) || [];
            return (
              <Accordion
                key={weekNum}
                defaultExpanded={weekNumbers.length <= 4}
                sx={{
                  mb: 1,
                  '&:before': { display: 'none' },
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '8px !important',
                  '&.Mui-expanded': { margin: '0 0 8px 0' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ minHeight: 48 }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>
                    Week {weekNum}
                  </Typography>
                  <Chip
                    label={`${weekSessions.length} sessions`}
                    size="small"
                    sx={{ ml: 1.5, height: 22, fontSize: '0.7rem' }}
                  />
                </AccordionSummary>
                <AccordionDetails sx={{ px: { xs: 1.5, sm: 2 }, pt: 0 }}>
                  {weekSessions.map((session, sIdx) => (
                    <Paper
                      key={`${session.week}-${session.day}-${session.slot}`}
                      variant="outlined"
                      sx={{
                        p: { xs: 1.5, sm: 2 },
                        mb: 1,
                        borderRadius: 1.5,
                        bgcolor: session.title
                          ? 'transparent'
                          : alpha(theme.palette.action.disabled, 0.04),
                      }}
                    >
                      {/* Session header */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: session.title ? 1.5 : 0,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Chip
                          label={`Day ${session.day}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                        <Chip
                          label={session.day_of_week.toUpperCase()}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                        <Chip
                          label={session.slot.toUpperCase()}
                          size="small"
                          color={session.slot === 'am' ? 'info' : 'warning'}
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                        {session.teacher && (
                          <Chip
                            label={session.teacher}
                            size="small"
                            color="secondary"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                        )}
                        {session.homework && (
                          <Chip
                            label={`HW: ${session.homework_type}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 22 }}
                          />
                        )}
                      </Box>

                      {/* Editable fields */}
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1.5,
                        }}
                      >
                        <TextField
                          label="Title"
                          size="small"
                          fullWidth
                          value={session.title}
                          onChange={(e) =>
                            updateSession(weekNum, sIdx, 'title', e.target.value)
                          }
                          placeholder="Session title..."
                          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                        />

                        <Box
                          sx={{
                            display: 'flex',
                            gap: 1.5,
                            flexDirection: { xs: 'column', sm: 'row' },
                          }}
                        >
                          <Select
                            size="small"
                            value={session.teacher || ''}
                            onChange={(e) =>
                              updateSession(
                                weekNum,
                                sIdx,
                                'teacher',
                                e.target.value as string
                              )
                            }
                            displayEmpty
                            sx={{
                              minWidth: 120,
                              minHeight: 48,
                              flex: { sm: '0 0 140px' },
                            }}
                          >
                            <MenuItem value="">
                              <em>No teacher</em>
                            </MenuItem>
                            {teacherMappings.map((t) => (
                              <MenuItem key={t.user_id} value={t.abbreviation}>
                                {t.abbreviation} ({t.name})
                              </MenuItem>
                            ))}
                          </Select>

                          <TextField
                            label="Homework"
                            size="small"
                            fullWidth
                            value={session.homework}
                            onChange={(e) =>
                              updateSession(
                                weekNum,
                                sIdx,
                                'homework',
                                e.target.value
                              )
                            }
                            placeholder="Homework title..."
                            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                          />
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </AccordionDetails>
              </Accordion>
            );
          })}

          {totalSessions === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', py: 4 }}
            >
              No sessions found in the CSV data.
            </Typography>
          )}
        </Box>
      )}

      {/* Weeks Tab */}
      {activeTab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.weeks.map((week, idx) => (
            <Paper
              key={idx}
              variant="outlined"
              sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5 }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}
              >
                <Chip
                  label={`W${week.week}`}
                  size="small"
                  color="primary"
                  sx={{ fontWeight: 700, fontSize: '0.7rem', height: 24 }}
                />
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <TextField
                  label="Title"
                  size="small"
                  fullWidth
                  value={week.title}
                  onChange={(e) => updateWeek(idx, 'title', e.target.value)}
                  placeholder="Week title..."
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <TextField
                  label="Goal"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={week.goal}
                  onChange={(e) => updateWeek(idx, 'goal', e.target.value)}
                  placeholder="Weekly learning goal..."
                />
              </Box>
            </Paper>
          ))}
          {data.weeks.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', py: 4 }}
            >
              No week data found in the CSV.
            </Typography>
          )}
        </Box>
      )}

      {/* Tests Tab */}
      {activeTab === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.tests.map((test, idx) => (
            <Paper
              key={idx}
              variant="outlined"
              sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                }}
              >
                <Chip
                  label={`Week ${test.week}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700, fontSize: '0.7rem', height: 24 }}
                />
                <IconButton
                  size="small"
                  onClick={() => removeTest(idx)}
                  sx={{ width: 36, height: 36 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <TextField
                  label="Title"
                  size="small"
                  fullWidth
                  value={test.title}
                  onChange={(e) => updateTest(idx, 'title', e.target.value)}
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <TextField
                    label="Week"
                    size="small"
                    type="number"
                    value={test.week}
                    onChange={(e) =>
                      updateTest(idx, 'week', parseInt(e.target.value, 10) || 1)
                    }
                    sx={{
                      flex: { sm: '0 0 100px' },
                      '& .MuiInputBase-root': { minHeight: 48 },
                    }}
                  />
                  <TextField
                    label="Questions"
                    size="small"
                    type="number"
                    value={test.questions}
                    onChange={(e) =>
                      updateTest(
                        idx,
                        'questions',
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    sx={{
                      flex: { sm: '0 0 100px' },
                      '& .MuiInputBase-root': { minHeight: 48 },
                    }}
                  />
                  <TextField
                    label="Duration (min)"
                    size="small"
                    type="number"
                    value={test.duration}
                    onChange={(e) =>
                      updateTest(
                        idx,
                        'duration',
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    sx={{
                      flex: { sm: '0 0 120px' },
                      '& .MuiInputBase-root': { minHeight: 48 },
                    }}
                  />
                </Box>
                <TextField
                  label="Scope"
                  size="small"
                  fullWidth
                  value={test.scope}
                  onChange={(e) => updateTest(idx, 'scope', e.target.value)}
                  placeholder="e.g., Weeks 1-3 topics"
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
              </Box>
            </Paper>
          ))}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={addTest}
            sx={{ minHeight: 48, textTransform: 'none', alignSelf: 'flex-start' }}
          >
            Add Test
          </Button>
        </Box>
      )}

      {/* Drills Tab */}
      {activeTab === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.drills.map((drill, idx) => (
            <Paper
              key={idx}
              variant="outlined"
              sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  mb: 0.5,
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => removeDrill(idx)}
                  sx={{ width: 36, height: 36 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <TextField
                  label="Question"
                  size="small"
                  fullWidth
                  value={drill.question}
                  onChange={(e) =>
                    updateDrill(idx, 'question', e.target.value)
                  }
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <TextField
                  label="Answer"
                  size="small"
                  fullWidth
                  value={drill.answer}
                  onChange={(e) =>
                    updateDrill(idx, 'answer', e.target.value)
                  }
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <TextField
                  label="Explanation"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={drill.explanation}
                  onChange={(e) =>
                    updateDrill(idx, 'explanation', e.target.value)
                  }
                />
                <TextField
                  label="Frequency"
                  size="small"
                  fullWidth
                  value={drill.frequency}
                  onChange={(e) =>
                    updateDrill(idx, 'frequency', e.target.value)
                  }
                  placeholder="e.g., daily, weekly"
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
              </Box>
            </Paper>
          ))}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={addDrill}
            sx={{ minHeight: 48, textTransform: 'none', alignSelf: 'flex-start' }}
          >
            Add Drill
          </Button>
        </Box>
      )}

      {/* Resources Tab */}
      {activeTab === 4 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.resources.map((res, idx) => (
            <Paper
              key={idx}
              variant="outlined"
              sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  mb: 0.5,
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => removeResource(idx)}
                  sx={{ width: 36, height: 36 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <TextField
                  label="Title"
                  size="small"
                  fullWidth
                  value={res.title}
                  onChange={(e) =>
                    updateResource(idx, 'title', e.target.value)
                  }
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <TextField
                  label="URL"
                  size="small"
                  fullWidth
                  value={res.url}
                  onChange={(e) =>
                    updateResource(idx, 'url', e.target.value)
                  }
                  sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
                />
                <Select
                  size="small"
                  value={res.type || 'reference'}
                  onChange={(e) =>
                    updateResource(idx, 'type', e.target.value as string)
                  }
                  sx={{ minHeight: 48 }}
                >
                  <MenuItem value="video">Video</MenuItem>
                  <MenuItem value="practice">Practice</MenuItem>
                  <MenuItem value="reference">Reference</MenuItem>
                  <MenuItem value="tool">Tool</MenuItem>
                </Select>
              </Box>
            </Paper>
          ))}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={addResource}
            sx={{ minHeight: 48, textTransform: 'none', alignSelf: 'flex-start' }}
          >
            Add Resource
          </Button>
        </Box>
      )}
    </Box>
  );
}
