'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  CircularProgress,
  FormControlLabel,
  Switch,
  RadioGroup,
  Radio,
  FormLabel,
  Rating,
  Skeleton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { ExamType, TestimonialLearningMode } from '@neram/database';

interface FormData {
  student_name: string;
  student_photo: string;
  content_en: string;
  content_ta: string;
  exam_type: ExamType;
  score: string;
  rank: string;
  college_admitted: string;
  year: string;
  course_name: string;
  course_slug: string;
  city: string;
  state: string;
  learning_mode: TestimonialLearningMode;
  rating: number | null;
  video_url: string;
  is_featured: boolean;
  is_homepage: boolean;
  display_order: string;
  is_active: boolean;
}

export default function EditTestimonialPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    student_name: '',
    student_photo: '',
    content_en: '',
    content_ta: '',
    exam_type: 'NATA',
    score: '',
    rank: '',
    college_admitted: '',
    year: '',
    course_name: '',
    course_slug: '',
    city: '',
    state: '',
    learning_mode: 'offline',
    rating: null,
    video_url: '',
    is_featured: false,
    is_homepage: false,
    display_order: '0',
    is_active: true,
  });

  // Fetch existing testimonial data
  useEffect(() => {
    const fetchTestimonial = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/testimonials/${id}`);
        const json = await res.json();

        if (res.status === 404) {
          setNotFound(true);
          return;
        }

        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch testimonial');
        }

        const t = json.data;
        const content = t.content || {};

        setFormData({
          student_name: t.student_name || '',
          student_photo: t.student_photo || '',
          content_en: content.en || '',
          content_ta: content.ta || '',
          exam_type: t.exam_type || 'NATA',
          score: t.score != null ? String(t.score) : '',
          rank: t.rank != null ? String(t.rank) : '',
          college_admitted: t.college_admitted || '',
          year: t.year != null ? String(t.year) : '',
          course_name: t.course_name || '',
          course_slug: t.course_slug || '',
          city: t.city || '',
          state: t.state || '',
          learning_mode: t.learning_mode || 'offline',
          rating: t.rating,
          video_url: t.video_url || '',
          is_featured: t.is_featured ?? false,
          is_homepage: t.is_homepage ?? false,
          display_order: t.display_order != null ? String(t.display_order) : '0',
          is_active: t.is_active ?? true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchTestimonial();
  }, [id]);

  const handleChange = (field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.student_name.trim()) {
      setError('Student name is required');
      return;
    }
    if (!formData.content_en.trim()) {
      setError('Testimonial content (English) is required');
      return;
    }
    if (!formData.year) {
      setError('Year is required');
      return;
    }
    if (!formData.course_name.trim()) {
      setError('Course name is required');
      return;
    }
    if (!formData.city.trim()) {
      setError('City is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const content: Record<string, string> = { en: formData.content_en.trim() };
      if (formData.content_ta.trim()) {
        content.ta = formData.content_ta.trim();
      }

      const payload = {
        student_name: formData.student_name.trim(),
        student_photo: formData.student_photo.trim() || null,
        content,
        exam_type: formData.exam_type,
        score: formData.score ? Number(formData.score) : null,
        rank: formData.rank ? Number(formData.rank) : null,
        college_admitted: formData.college_admitted.trim() || null,
        year: Number(formData.year),
        course_name: formData.course_name.trim(),
        course_slug: formData.course_slug.trim() || null,
        city: formData.city.trim(),
        state: formData.state.trim() || 'Tamil Nadu',
        learning_mode: formData.learning_mode,
        rating: formData.rating,
        video_url: formData.video_url.trim() || null,
        is_featured: formData.is_featured,
        is_homepage: formData.is_homepage,
        display_order: Number(formData.display_order) || 0,
        is_active: formData.is_active,
      };

      const res = await fetch(`/api/testimonials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to update testimonial');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h5" gutterBottom>
          Testimonial Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          The testimonial you are looking for does not exist or has been removed.
        </Typography>
        <Button
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/testimonials')}
        >
          Back to Testimonials
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Skeleton variant="rectangular" width={80} height={36} />
          <Box>
            <Skeleton variant="text" width={250} height={40} />
            <Skeleton variant="text" width={180} height={24} />
          </Box>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Skeleton variant="rectangular" height={500} sx={{ borderRadius: 1 }} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/testimonials')}>
          Back
        </Button>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Edit Testimonial
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Update {formData.student_name || 'student'}&apos;s testimonial
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Testimonial updated successfully!
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Left Column - Main Form */}
          <Grid item xs={12} md={8}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Student Info
                </Typography>

                <TextField
                  fullWidth
                  label="Student Name"
                  value={formData.student_name}
                  onChange={(e) => handleChange('student_name', e.target.value)}
                  required
                  sx={{ mb: 3 }}
                />

                <Typography variant="h6" gutterBottom>
                  Testimonial Content
                </Typography>

                <TextField
                  fullWidth
                  label="Content (English)"
                  value={formData.content_en}
                  onChange={(e) => handleChange('content_en', e.target.value)}
                  multiline
                  rows={4}
                  required
                  placeholder="Write the student's testimonial in English..."
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Content (Tamil) - Optional"
                  value={formData.content_ta}
                  onChange={(e) => handleChange('content_ta', e.target.value)}
                  multiline
                  rows={4}
                  placeholder="Write the student's testimonial in Tamil (optional)..."
                  sx={{ mb: 2 }}
                />

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Exam Details
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                      <InputLabel>Exam Type</InputLabel>
                      <Select
                        value={formData.exam_type}
                        label="Exam Type"
                        onChange={(e) => handleChange('exam_type', e.target.value)}
                      >
                        <MenuItem value="NATA">NATA</MenuItem>
                        <MenuItem value="JEE_PAPER_2">JEE Paper 2</MenuItem>
                        <MenuItem value="BOTH">Both</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Score"
                      type="number"
                      value={formData.score}
                      onChange={(e) => handleChange('score', e.target.value)}
                      placeholder="e.g., 180"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Rank"
                      type="number"
                      value={formData.rank}
                      onChange={(e) => handleChange('rank', e.target.value)}
                      placeholder="e.g., 25"
                    />
                  </Grid>
                </Grid>

                <TextField
                  fullWidth
                  label="College Admitted"
                  value={formData.college_admitted}
                  onChange={(e) => handleChange('college_admitted', e.target.value)}
                  placeholder="e.g., IIT Kharagpur, NIT Trichy"
                  sx={{ mt: 2 }}
                />

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Course & Location
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Year"
                      type="number"
                      value={formData.year}
                      onChange={(e) => handleChange('year', e.target.value)}
                      required
                      inputProps={{ min: 2015, max: 2030 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Course Name"
                      value={formData.course_name}
                      onChange={(e) => handleChange('course_name', e.target.value)}
                      required
                      placeholder="e.g., NATA Crash Course"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="City"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      placeholder="e.g., Chennai"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="State"
                      value={formData.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      placeholder="Tamil Nadu"
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Learning Mode
                </Typography>

                <FormControl component="fieldset">
                  <RadioGroup
                    row
                    value={formData.learning_mode}
                    onChange={(e) => handleChange('learning_mode', e.target.value)}
                  >
                    <FormControlLabel value="offline" control={<Radio />} label="Offline" />
                    <FormControlLabel value="online" control={<Radio />} label="Online" />
                    <FormControlLabel value="hybrid" control={<Radio />} label="Hybrid" />
                  </RadioGroup>
                </FormControl>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Rating & Media
                </Typography>

                <Box sx={{ mb: 2 }}>
                  <FormLabel sx={{ mb: 0.5, display: 'block' }}>Rating</FormLabel>
                  <Rating
                    value={formData.rating}
                    onChange={(_, value) => handleChange('rating', value)}
                    size="large"
                  />
                </Box>

                <TextField
                  fullWidth
                  label="Video URL (Optional)"
                  value={formData.video_url}
                  onChange={(e) => handleChange('video_url', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  helperText="YouTube or other video URL"
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Right Column - Settings */}
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Photo
                </Typography>
                <TextField
                  fullWidth
                  label="Photo URL"
                  value={formData.student_photo}
                  onChange={(e) => handleChange('student_photo', e.target.value)}
                  placeholder="https://..."
                  helperText="Direct link to student photo"
                  size="small"
                />
              </CardContent>
            </Card>

            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Display Settings
                </Typography>

                <TextField
                  fullWidth
                  label="Course Slug (Optional)"
                  value={formData.course_slug}
                  onChange={(e) => handleChange('course_slug', e.target.value)}
                  placeholder="nata-crash-course"
                  helperText="URL-friendly slug for linking"
                  size="small"
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Display Order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => handleChange('display_order', e.target.value)}
                  helperText="Lower number = shown first"
                  size="small"
                  inputProps={{ min: 0 }}
                  sx={{ mb: 2 }}
                />

                <Divider sx={{ my: 2 }} />

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_featured}
                      onChange={(e) => handleChange('is_featured', e.target.checked)}
                    />
                  }
                  label="Featured"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mb: 1.5, mt: -0.5 }}>
                  Show in featured testimonials section
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_homepage}
                      onChange={(e) => handleChange('is_homepage', e.target.checked)}
                    />
                  }
                  label="Show on Homepage"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mb: 1.5, mt: -0.5 }}>
                  Display on the marketing homepage
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_active}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                    />
                  }
                  label="Active"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mt: -0.5 }}>
                  Only active testimonials are publicly visible
                </Typography>
              </CardContent>
            </Card>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={saving}
              sx={{ minHeight: 48 }}
            >
              {saving ? <CircularProgress size={24} /> : 'Save Changes'}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
