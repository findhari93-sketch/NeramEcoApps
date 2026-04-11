'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '@/components/DataTable';
import CopyablePhone from '@/components/CopyablePhone';

// ============================================
// Types
// ============================================

interface NataBrochure {
  id: string;
  version: string;
  release_date: string;
  year: number;
  file_url: string;
  file_size_bytes: number | null;
  changelog: string | null;
  is_current: boolean;
  download_count: number;
  is_active: boolean;
  display_order: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface NataFaq {
  id: string;
  question: Record<string, string>;
  answer: Record<string, string>;
  category: string;
  page_slug: string | null;
  year: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface NataAnnouncement {
  id: string;
  text: Record<string, string>;
  link: string | null;
  bg_color: string;
  text_color: string;
  severity: 'info' | 'warning' | 'urgent';
  year: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface NataBanner {
  id: string;
  spot: string;
  heading: Record<string, string>;
  subtext: Record<string, string>;
  image_url: string | null;
  mobile_image_url: string | null;
  cta_text: Record<string, string>;
  cta_link: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface NataAssistanceRequest {
  id: string;
  student_name: string;
  phone: string;
  district: string | null;
  school_name: string | null;
  category: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Constants
// ============================================

const TAB_LABELS = ['Brochures', 'FAQs', 'Announcements', 'Banners', 'Assistance Requests'];

const FAQ_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'eligibility', label: 'Eligibility' },
  { value: 'exam_pattern', label: 'Exam Pattern' },
  { value: 'registration', label: 'Registration' },
  { value: 'scoring', label: 'Scoring' },
];

const FAQ_PAGE_SLUGS = [
  { value: '', label: '(None)' },
  { value: 'hub', label: 'Hub' },
  { value: 'eligibility', label: 'Eligibility' },
  { value: 'exam-pattern', label: 'Exam Pattern' },
  { value: 'registration', label: 'Registration' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'syllabus', label: 'Syllabus' },
  { value: 'preparation', label: 'Preparation' },
  { value: 'colleges', label: 'Colleges' },
  { value: 'previous-papers', label: 'Previous Papers' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'urgent', label: 'Urgent' },
];

const BANNER_SPOTS = [
  { value: 'hero', label: 'Hero' },
  { value: 'mid_page', label: 'Mid Page' },
  { value: 'bottom_cta', label: 'Bottom CTA' },
  { value: 'sidebar', label: 'Sidebar' },
];

const ASSISTANCE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

// ============================================
// Empty Form States
// ============================================

const emptyBrochureForm = {
  version: '',
  release_date: '',
  year: new Date().getFullYear(),
  file_url: '',
  file_size_bytes: '',
  changelog: '',
  is_current: false,
  is_active: true,
  display_order: 0,
};

const emptyFaqForm = {
  question_en: '',
  question_ta: '',
  answer_en: '',
  answer_ta: '',
  category: 'general',
  page_slug: '',
  year: new Date().getFullYear(),
  display_order: 0,
  is_active: true,
};

const emptyAnnouncementForm = {
  text_en: '',
  text_ta: '',
  link: '',
  bg_color: '#e3f2fd',
  text_color: '#1565c0',
  severity: 'info' as 'info' | 'warning' | 'urgent',
  year: new Date().getFullYear(),
  is_active: true,
  start_date: '',
  end_date: '',
  priority: 0,
};

const emptyBannerForm = {
  spot: 'hero',
  heading_en: '',
  heading_ta: '',
  subtext_en: '',
  subtext_ta: '',
  image_url: '',
  mobile_image_url: '',
  cta_text_en: '',
  cta_link: '',
  is_active: true,
  start_date: '',
  end_date: '',
  display_order: 0,
};

const emptyAssistanceForm = {
  status: 'pending',
  assigned_to: '',
  notes: '',
};

// ============================================
// Main Page Component
// ============================================

export default function NataContentPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // ---- Brochures state ----
  const [brochures, setBrochures] = useState<NataBrochure[]>([]);
  const [brochuresLoading, setBrochuresLoading] = useState(true);
  const [brochureDialogOpen, setBrochureDialogOpen] = useState(false);
  const [editingBrochure, setEditingBrochure] = useState<NataBrochure | null>(null);
  const [brochureForm, setBrochureForm] = useState(emptyBrochureForm);
  const [brochureSaving, setBrochureSaving] = useState(false);

  // ---- FAQs state ----
  const [faqs, setFaqs] = useState<NataFaq[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<NataFaq | null>(null);
  const [faqForm, setFaqForm] = useState(emptyFaqForm);
  const [faqSaving, setFaqSaving] = useState(false);

  // ---- Announcements state ----
  const [announcements, setAnnouncements] = useState<NataAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<NataAnnouncement | null>(null);
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncementForm);
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  // ---- Banners state ----
  const [banners, setBanners] = useState<NataBanner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<NataBanner | null>(null);
  const [bannerForm, setBannerForm] = useState(emptyBannerForm);
  const [bannerSaving, setBannerSaving] = useState(false);

  // ---- Assistance state ----
  const [assistanceRequests, setAssistanceRequests] = useState<NataAssistanceRequest[]>([]);
  const [assistanceLoading, setAssistanceLoading] = useState(true);
  const [assistanceDialogOpen, setAssistanceDialogOpen] = useState(false);
  const [editingAssistance, setEditingAssistance] = useState<NataAssistanceRequest | null>(null);
  const [assistanceForm, setAssistanceForm] = useState(emptyAssistanceForm);
  const [assistanceSaving, setAssistanceSaving] = useState(false);

  // ============================================
  // Fetch functions
  // ============================================

  const fetchBrochures = useCallback(async () => {
    try {
      setBrochuresLoading(true);
      const res = await fetch('/api/nata/brochures');
      const json = await res.json();
      setBrochures(json.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load brochures', severity: 'error' });
    } finally {
      setBrochuresLoading(false);
    }
  }, []);

  const fetchFaqs = useCallback(async () => {
    try {
      setFaqsLoading(true);
      const res = await fetch('/api/nata/faqs');
      const json = await res.json();
      setFaqs(json.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load FAQs', severity: 'error' });
    } finally {
      setFaqsLoading(false);
    }
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setAnnouncementsLoading(true);
      const res = await fetch('/api/nata/announcements');
      const json = await res.json();
      setAnnouncements(json.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load announcements', severity: 'error' });
    } finally {
      setAnnouncementsLoading(false);
    }
  }, []);

  const fetchBanners = useCallback(async () => {
    try {
      setBannersLoading(true);
      const res = await fetch('/api/nata/banners');
      const json = await res.json();
      setBanners(json.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load banners', severity: 'error' });
    } finally {
      setBannersLoading(false);
    }
  }, []);

  const fetchAssistance = useCallback(async () => {
    try {
      setAssistanceLoading(true);
      const res = await fetch('/api/nata/assistance');
      const json = await res.json();
      setAssistanceRequests(json.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load assistance requests', severity: 'error' });
    } finally {
      setAssistanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tabIndex === 0) fetchBrochures();
    else if (tabIndex === 1) fetchFaqs();
    else if (tabIndex === 2) fetchAnnouncements();
    else if (tabIndex === 3) fetchBanners();
    else if (tabIndex === 4) fetchAssistance();
  }, [tabIndex, fetchBrochures, fetchFaqs, fetchAnnouncements, fetchBanners, fetchAssistance]);

  // ============================================
  // BROCHURES — dialog & CRUD
  // ============================================

  const openBrochureDialog = (item?: NataBrochure) => {
    if (item) {
      setEditingBrochure(item);
      setBrochureForm({
        version: item.version,
        release_date: item.release_date ? item.release_date.slice(0, 10) : '',
        year: item.year,
        file_url: item.file_url,
        file_size_bytes: item.file_size_bytes != null ? String(item.file_size_bytes) : '',
        changelog: item.changelog || '',
        is_current: item.is_current,
        is_active: item.is_active,
        display_order: item.display_order,
      });
    } else {
      setEditingBrochure(null);
      setBrochureForm(emptyBrochureForm);
    }
    setBrochureDialogOpen(true);
  };

  const closeBrochureDialog = () => {
    setBrochureDialogOpen(false);
    setEditingBrochure(null);
    setBrochureForm(emptyBrochureForm);
  };

  const saveBrochure = async () => {
    if (!brochureForm.version.trim() || !brochureForm.file_url.trim()) {
      setSnackbar({ open: true, message: 'Version and file URL are required', severity: 'error' });
      return;
    }
    try {
      setBrochureSaving(true);
      const payload = {
        version: brochureForm.version,
        release_date: brochureForm.release_date || new Date().toISOString().slice(0, 10),
        year: brochureForm.year,
        file_url: brochureForm.file_url,
        file_size_bytes: brochureForm.file_size_bytes ? parseInt(brochureForm.file_size_bytes, 10) : null,
        changelog: brochureForm.changelog || null,
        is_current: brochureForm.is_current,
        is_active: brochureForm.is_active,
        display_order: brochureForm.display_order,
      };

      if (editingBrochure) {
        const res = await fetch(`/api/nata/brochures/${editingBrochure.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update');
        setSnackbar({ open: true, message: 'Brochure updated', severity: 'success' });
      } else {
        const res = await fetch('/api/nata/brochures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
        setSnackbar({ open: true, message: 'Brochure created', severity: 'success' });
      }
      closeBrochureDialog();
      fetchBrochures();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save brochure';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setBrochureSaving(false);
    }
  };

  const deleteBrochure = async (id: string) => {
    if (!confirm('Delete this brochure?')) return;
    try {
      const res = await fetch(`/api/nata/brochures/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSnackbar({ open: true, message: 'Brochure deleted', severity: 'success' });
      fetchBrochures();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete brochure', severity: 'error' });
    }
  };

  // ============================================
  // FAQs — dialog & CRUD
  // ============================================

  const openFaqDialog = (item?: NataFaq) => {
    if (item) {
      setEditingFaq(item);
      setFaqForm({
        question_en: item.question?.en || '',
        question_ta: item.question?.ta || '',
        answer_en: item.answer?.en || '',
        answer_ta: item.answer?.ta || '',
        category: item.category || 'general',
        page_slug: item.page_slug || '',
        year: item.year,
        display_order: item.display_order,
        is_active: item.is_active,
      });
    } else {
      setEditingFaq(null);
      setFaqForm(emptyFaqForm);
    }
    setFaqDialogOpen(true);
  };

  const closeFaqDialog = () => {
    setFaqDialogOpen(false);
    setEditingFaq(null);
    setFaqForm(emptyFaqForm);
  };

  const saveFaq = async () => {
    if (!faqForm.question_en.trim() || !faqForm.answer_en.trim()) {
      setSnackbar({ open: true, message: 'Question and Answer (English) are required', severity: 'error' });
      return;
    }
    try {
      setFaqSaving(true);
      const question: Record<string, string> = { en: faqForm.question_en };
      if (faqForm.question_ta.trim()) question.ta = faqForm.question_ta;
      const answer: Record<string, string> = { en: faqForm.answer_en };
      if (faqForm.answer_ta.trim()) answer.ta = faqForm.answer_ta;

      const payload = {
        question,
        answer,
        category: faqForm.category,
        page_slug: faqForm.page_slug || null,
        year: faqForm.year,
        display_order: faqForm.display_order,
        is_active: faqForm.is_active,
      };

      if (editingFaq) {
        const res = await fetch(`/api/nata/faqs/${editingFaq.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update');
        setSnackbar({ open: true, message: 'FAQ updated', severity: 'success' });
      } else {
        const res = await fetch('/api/nata/faqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
        setSnackbar({ open: true, message: 'FAQ created', severity: 'success' });
      }
      closeFaqDialog();
      fetchFaqs();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save FAQ';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setFaqSaving(false);
    }
  };

  const deleteFaq = async (id: string) => {
    if (!confirm('Delete this FAQ?')) return;
    try {
      const res = await fetch(`/api/nata/faqs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSnackbar({ open: true, message: 'FAQ deleted', severity: 'success' });
      fetchFaqs();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete FAQ', severity: 'error' });
    }
  };

  // ============================================
  // ANNOUNCEMENTS — dialog & CRUD
  // ============================================

  const openAnnouncementDialog = (item?: NataAnnouncement) => {
    if (item) {
      setEditingAnnouncement(item);
      setAnnouncementForm({
        text_en: item.text?.en || '',
        text_ta: item.text?.ta || '',
        link: item.link || '',
        bg_color: item.bg_color || '#e3f2fd',
        text_color: item.text_color || '#1565c0',
        severity: (item.severity || 'info') as 'info' | 'warning' | 'urgent',
        year: item.year,
        is_active: item.is_active,
        start_date: item.start_date ? item.start_date.slice(0, 16) : '',
        end_date: item.end_date ? item.end_date.slice(0, 16) : '',
        priority: item.priority,
      });
    } else {
      setEditingAnnouncement(null);
      setAnnouncementForm(emptyAnnouncementForm);
    }
    setAnnouncementDialogOpen(true);
  };

  const closeAnnouncementDialog = () => {
    setAnnouncementDialogOpen(false);
    setEditingAnnouncement(null);
    setAnnouncementForm(emptyAnnouncementForm);
  };

  const saveAnnouncement = async () => {
    if (!announcementForm.text_en.trim()) {
      setSnackbar({ open: true, message: 'Text (English) is required', severity: 'error' });
      return;
    }
    try {
      setAnnouncementSaving(true);
      const text: Record<string, string> = { en: announcementForm.text_en };
      if (announcementForm.text_ta.trim()) text.ta = announcementForm.text_ta;

      const payload = {
        text,
        link: announcementForm.link || null,
        bg_color: announcementForm.bg_color,
        text_color: announcementForm.text_color,
        severity: announcementForm.severity,
        year: announcementForm.year,
        is_active: announcementForm.is_active,
        start_date: announcementForm.start_date ? new Date(announcementForm.start_date).toISOString() : null,
        end_date: announcementForm.end_date ? new Date(announcementForm.end_date).toISOString() : null,
        priority: announcementForm.priority,
      };

      if (editingAnnouncement) {
        const res = await fetch(`/api/nata/announcements/${editingAnnouncement.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update');
        setSnackbar({ open: true, message: 'Announcement updated', severity: 'success' });
      } else {
        const res = await fetch('/api/nata/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
        setSnackbar({ open: true, message: 'Announcement created', severity: 'success' });
      }
      closeAnnouncementDialog();
      fetchAnnouncements();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save announcement';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setAnnouncementSaving(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      const res = await fetch(`/api/nata/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSnackbar({ open: true, message: 'Announcement deleted', severity: 'success' });
      fetchAnnouncements();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete announcement', severity: 'error' });
    }
  };

  // ============================================
  // BANNERS — dialog & CRUD
  // ============================================

  const openBannerDialog = (item?: NataBanner) => {
    if (item) {
      setEditingBanner(item);
      setBannerForm({
        spot: item.spot || 'hero',
        heading_en: item.heading?.en || '',
        heading_ta: item.heading?.ta || '',
        subtext_en: item.subtext?.en || '',
        subtext_ta: item.subtext?.ta || '',
        image_url: item.image_url || '',
        mobile_image_url: item.mobile_image_url || '',
        cta_text_en: item.cta_text?.en || '',
        cta_link: item.cta_link || '',
        is_active: item.is_active,
        start_date: item.start_date ? item.start_date.slice(0, 16) : '',
        end_date: item.end_date ? item.end_date.slice(0, 16) : '',
        display_order: item.display_order,
      });
    } else {
      setEditingBanner(null);
      setBannerForm(emptyBannerForm);
    }
    setBannerDialogOpen(true);
  };

  const closeBannerDialog = () => {
    setBannerDialogOpen(false);
    setEditingBanner(null);
    setBannerForm(emptyBannerForm);
  };

  const saveBanner = async () => {
    if (!bannerForm.spot || !bannerForm.heading_en.trim()) {
      setSnackbar({ open: true, message: 'Spot and Heading (English) are required', severity: 'error' });
      return;
    }
    try {
      setBannerSaving(true);
      const heading: Record<string, string> = { en: bannerForm.heading_en };
      if (bannerForm.heading_ta.trim()) heading.ta = bannerForm.heading_ta;
      const subtext: Record<string, string> = {};
      if (bannerForm.subtext_en.trim()) subtext.en = bannerForm.subtext_en;
      if (bannerForm.subtext_ta.trim()) subtext.ta = bannerForm.subtext_ta;
      const cta_text: Record<string, string> = {};
      if (bannerForm.cta_text_en.trim()) cta_text.en = bannerForm.cta_text_en;

      const payload = {
        spot: bannerForm.spot,
        heading,
        subtext,
        image_url: bannerForm.image_url || null,
        mobile_image_url: bannerForm.mobile_image_url || null,
        cta_text,
        cta_link: bannerForm.cta_link || null,
        is_active: bannerForm.is_active,
        start_date: bannerForm.start_date ? new Date(bannerForm.start_date).toISOString() : null,
        end_date: bannerForm.end_date ? new Date(bannerForm.end_date).toISOString() : null,
        display_order: bannerForm.display_order,
      };

      if (editingBanner) {
        const res = await fetch(`/api/nata/banners/${editingBanner.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update');
        setSnackbar({ open: true, message: 'Banner updated', severity: 'success' });
      } else {
        const res = await fetch('/api/nata/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create');
        setSnackbar({ open: true, message: 'Banner created', severity: 'success' });
      }
      closeBannerDialog();
      fetchBanners();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save banner';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setBannerSaving(false);
    }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    try {
      const res = await fetch(`/api/nata/banners/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSnackbar({ open: true, message: 'Banner deleted', severity: 'success' });
      fetchBanners();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete banner', severity: 'error' });
    }
  };

  // ============================================
  // ASSISTANCE — dialog & update
  // ============================================

  const openAssistanceDialog = (item: NataAssistanceRequest) => {
    setEditingAssistance(item);
    setAssistanceForm({
      status: item.status,
      assigned_to: item.assigned_to || '',
      notes: item.notes || '',
    });
    setAssistanceDialogOpen(true);
  };

  const closeAssistanceDialog = () => {
    setAssistanceDialogOpen(false);
    setEditingAssistance(null);
    setAssistanceForm(emptyAssistanceForm);
  };

  const saveAssistance = async () => {
    if (!editingAssistance) return;
    try {
      setAssistanceSaving(true);
      const payload = {
        status: assistanceForm.status,
        assigned_to: assistanceForm.assigned_to || null,
        notes: assistanceForm.notes || null,
      };
      const res = await fetch(`/api/nata/assistance/${editingAssistance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update');
      setSnackbar({ open: true, message: 'Assistance request updated', severity: 'success' });
      closeAssistanceDialog();
      fetchAssistance();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setAssistanceSaving(false);
    }
  };

  // ============================================
  // Column definitions
  // ============================================

  const brochureColumns = [
    { field: 'version', headerName: 'Version', width: 100 },
    {
      field: 'release_date',
      headerName: 'Release Date',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>
          {params.value ? new Date(params.value).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      field: 'is_current',
      headerName: 'Current',
      width: 80,
      renderCell: (params: any) => (
        params.value ? <Chip label="Yes" size="small" color="primary" variant="outlined" /> : <Chip label="No" size="small" variant="outlined" />
      ),
    },
    { field: 'download_count', headerName: 'Downloads', width: 100 },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 80,
      renderCell: (params: any) => (
        <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    { field: 'display_order', headerName: 'Order', width: 70 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" color="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openBrochureDialog(params.row); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteBrochure(params.row.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const faqColumns = [
    {
      field: 'question',
      headerName: 'Question',
      width: 300,
      renderCell: (params: any) => (
        <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>
          {params.value?.en || '(no question)'}
        </Typography>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      renderCell: (params: any) => (
        <Chip
          label={FAQ_CATEGORIES.find((c) => c.value === params.value)?.label || params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'page_slug',
      headerName: 'Page',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value || '-'}</Typography>
      ),
    },
    { field: 'display_order', headerName: 'Order', width: 70 },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 80,
      renderCell: (params: any) => (
        <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" color="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openFaqDialog(params.row); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteFaq(params.row.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const announcementColumns = [
    {
      field: 'text',
      headerName: 'Text',
      width: 280,
      renderCell: (params: any) => (
        <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>
          {params.value?.en || '(no text)'}
        </Typography>
      ),
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 100,
      renderCell: (params: any) => {
        const colors: Record<string, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', urgent: 'error' };
        return <Chip label={params.value} size="small" color={colors[params.value] || 'default'} />;
      },
    },
    { field: 'priority', headerName: 'Priority', width: 80 },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 80,
      renderCell: (params: any) => (
        <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    {
      field: 'start_date',
      headerName: 'Start',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value ? new Date(params.value).toLocaleDateString() : '-'}</Typography>
      ),
    },
    {
      field: 'end_date',
      headerName: 'End',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value ? new Date(params.value).toLocaleDateString() : '-'}</Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" color="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openAnnouncementDialog(params.row); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteAnnouncement(params.row.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const bannerColumns = [
    {
      field: 'spot',
      headerName: 'Spot',
      width: 120,
      renderCell: (params: any) => (
        <Chip
          label={BANNER_SPOTS.find((s) => s.value === params.value)?.label || params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'heading',
      headerName: 'Heading',
      width: 250,
      renderCell: (params: any) => (
        <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>
          {params.value?.en || '(no heading)'}
        </Typography>
      ),
    },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 80,
      renderCell: (params: any) => (
        <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    { field: 'display_order', headerName: 'Order', width: 70 },
    {
      field: 'start_date',
      headerName: 'Start',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value ? new Date(params.value).toLocaleDateString() : '-'}</Typography>
      ),
    },
    {
      field: 'end_date',
      headerName: 'End',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value ? new Date(params.value).toLocaleDateString() : '-'}</Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" color="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openBannerDialog(params.row); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteBanner(params.row.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const assistanceColumns = [
    {
      field: 'student_name',
      headerName: 'Student Name',
      width: 160,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value}</Typography>
      ),
    },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 160,
      renderCell: (params: any) => (
        <CopyablePhone phone={params.value} showOnHover noWrap textSx={{ fontSize: 13 }} />
      ),
    },
    {
      field: 'district',
      headerName: 'District',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'school_name',
      headerName: 'School',
      width: 160,
      renderCell: (params: any) => (
        <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 110,
      renderCell: (params: any) => (
        <Chip label={params.value || 'general'} size="small" variant="outlined" />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (params: any) => {
        const colors: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
          pending: 'warning',
          contacted: 'info',
          resolved: 'success',
          closed: 'default',
        };
        return <Chip label={params.value} size="small" color={colors[params.value] || 'default'} />;
      },
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 120,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>
          {params.value ? new Date(params.value).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      renderCell: (params: any) => (
        <IconButton size="small" color="primary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openAssistanceDialog(params.row); }}>
          <EditIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  // ============================================
  // Render
  // ============================================

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            NATA Content
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage NATA brochures, FAQs, announcements, banners, and assistance requests
          </Typography>
        </Box>
        {tabIndex < 4 && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="small"
            onClick={() => {
              if (tabIndex === 0) openBrochureDialog();
              else if (tabIndex === 1) openFaqDialog();
              else if (tabIndex === 2) openAnnouncementDialog();
              else if (tabIndex === 3) openBannerDialog();
            }}
          >
            Add {TAB_LABELS[tabIndex].replace(/s$/, '')}
          </Button>
        )}
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TAB_LABELS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {/* Tab 0 — Brochures */}
      {tabIndex === 0 && (
        <DataTable rows={brochures} columns={brochureColumns} loading={brochuresLoading} />
      )}

      {/* Tab 1 — FAQs */}
      {tabIndex === 1 && (
        <DataTable rows={faqs} columns={faqColumns} loading={faqsLoading} />
      )}

      {/* Tab 2 — Announcements */}
      {tabIndex === 2 && (
        <DataTable rows={announcements} columns={announcementColumns} loading={announcementsLoading} />
      )}

      {/* Tab 3 — Banners */}
      {tabIndex === 3 && (
        <DataTable rows={banners} columns={bannerColumns} loading={bannersLoading} />
      )}

      {/* Tab 4 — Assistance Requests */}
      {tabIndex === 4 && (
        <DataTable rows={assistanceRequests} columns={assistanceColumns} loading={assistanceLoading} />
      )}

      {/* ============================================ */}
      {/* BROCHURE DIALOG */}
      {/* ============================================ */}
      <Dialog open={brochureDialogOpen} onClose={closeBrochureDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingBrochure ? 'Edit Brochure' : 'Add Brochure'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Version"
                value={brochureForm.version}
                onChange={(e) => setBrochureForm({ ...brochureForm, version: e.target.value })}
                fullWidth
                required
                placeholder="e.g., 1.0"
              />
              <TextField
                label="Release Date"
                type="date"
                value={brochureForm.release_date}
                onChange={(e) => setBrochureForm({ ...brochureForm, release_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <TextField
              label="File URL"
              value={brochureForm.file_url}
              onChange={(e) => setBrochureForm({ ...brochureForm, file_url: e.target.value })}
              fullWidth
              required
              placeholder="https://..."
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="File Size (bytes)"
                type="number"
                value={brochureForm.file_size_bytes}
                onChange={(e) => setBrochureForm({ ...brochureForm, file_size_bytes: e.target.value })}
                fullWidth
              />
              <TextField
                label="Year"
                type="number"
                value={brochureForm.year}
                onChange={(e) => setBrochureForm({ ...brochureForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                fullWidth
              />
            </Box>
            <TextField
              label="Changelog"
              value={brochureForm.changelog}
              onChange={(e) => setBrochureForm({ ...brochureForm, changelog: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Display Order"
                type="number"
                value={brochureForm.display_order}
                onChange={(e) => setBrochureForm({ ...brochureForm, display_order: parseInt(e.target.value) || 0 })}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={brochureForm.is_current}
                    onChange={(e) => setBrochureForm({ ...brochureForm, is_current: e.target.checked })}
                  />
                }
                label="Is Current Version"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={brochureForm.is_active}
                    onChange={(e) => setBrochureForm({ ...brochureForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBrochureDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveBrochure} disabled={brochureSaving}>
            {brochureSaving ? 'Saving...' : editingBrochure ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* FAQ DIALOG */}
      {/* ============================================ */}
      <Dialog open={faqDialogOpen} onClose={closeFaqDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingFaq ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Question (English)"
                value={faqForm.question_en}
                onChange={(e) => setFaqForm({ ...faqForm, question_en: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="Question (Tamil)"
                value={faqForm.question_ta}
                onChange={(e) => setFaqForm({ ...faqForm, question_ta: e.target.value })}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Answer (English)"
                value={faqForm.answer_en}
                onChange={(e) => setFaqForm({ ...faqForm, answer_en: e.target.value })}
                fullWidth
                required
                multiline
                rows={4}
              />
              <TextField
                label="Answer (Tamil)"
                value={faqForm.answer_ta}
                onChange={(e) => setFaqForm({ ...faqForm, answer_ta: e.target.value })}
                fullWidth
                multiline
                rows={4}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Category"
                value={faqForm.category}
                onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                fullWidth
              >
                {FAQ_CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Page Slug"
                value={faqForm.page_slug}
                onChange={(e) => setFaqForm({ ...faqForm, page_slug: e.target.value })}
                fullWidth
              >
                {FAQ_PAGE_SLUGS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Year"
                type="number"
                value={faqForm.year}
                onChange={(e) => setFaqForm({ ...faqForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                fullWidth
              />
              <TextField
                label="Display Order"
                type="number"
                value={faqForm.display_order}
                onChange={(e) => setFaqForm({ ...faqForm, display_order: parseInt(e.target.value) || 0 })}
                fullWidth
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={faqForm.is_active}
                  onChange={(e) => setFaqForm({ ...faqForm, is_active: e.target.checked })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFaqDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveFaq} disabled={faqSaving}>
            {faqSaving ? 'Saving...' : editingFaq ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* ANNOUNCEMENT DIALOG */}
      {/* ============================================ */}
      <Dialog open={announcementDialogOpen} onClose={closeAnnouncementDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingAnnouncement ? 'Edit Announcement' : 'Add Announcement'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Text (English)"
                value={announcementForm.text_en}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, text_en: e.target.value })}
                fullWidth
                required
                multiline
                rows={2}
              />
              <TextField
                label="Text (Tamil)"
                value={announcementForm.text_ta}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, text_ta: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Box>
            <TextField
              label="Link URL"
              value={announcementForm.link}
              onChange={(e) => setAnnouncementForm({ ...announcementForm, link: e.target.value })}
              fullWidth
              placeholder="https://..."
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Background Color"
                value={announcementForm.bg_color}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, bg_color: e.target.value })}
                fullWidth
                placeholder="#e3f2fd"
                InputProps={{
                  startAdornment: (
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 0.5,
                        bgcolor: announcementForm.bg_color,
                        border: '1px solid',
                        borderColor: 'divider',
                        mr: 1,
                        flexShrink: 0,
                      }}
                    />
                  ),
                }}
              />
              <TextField
                label="Text Color"
                value={announcementForm.text_color}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, text_color: e.target.value })}
                fullWidth
                placeholder="#1565c0"
                InputProps={{
                  startAdornment: (
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 0.5,
                        bgcolor: announcementForm.text_color,
                        border: '1px solid',
                        borderColor: 'divider',
                        mr: 1,
                        flexShrink: 0,
                      }}
                    />
                  ),
                }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Severity"
                value={announcementForm.severity}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, severity: e.target.value as 'info' | 'warning' | 'urgent' })}
                fullWidth
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Priority"
                type="number"
                value={announcementForm.priority}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, priority: parseInt(e.target.value) || 0 })}
                fullWidth
                helperText="Higher = shown first"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Date"
                type="datetime-local"
                value={announcementForm.start_date}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, start_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Date"
                type="datetime-local"
                value={announcementForm.end_date}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, end_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Year"
                type="number"
                value={announcementForm.year}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={announcementForm.is_active}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAnnouncementDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveAnnouncement} disabled={announcementSaving}>
            {announcementSaving ? 'Saving...' : editingAnnouncement ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* BANNER DIALOG */}
      {/* ============================================ */}
      <Dialog open={bannerDialogOpen} onClose={closeBannerDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add Banner'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              select
              label="Spot"
              value={bannerForm.spot}
              onChange={(e) => setBannerForm({ ...bannerForm, spot: e.target.value })}
              fullWidth
              required
            >
              {BANNER_SPOTS.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Heading (English)"
                value={bannerForm.heading_en}
                onChange={(e) => setBannerForm({ ...bannerForm, heading_en: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="Heading (Tamil)"
                value={bannerForm.heading_ta}
                onChange={(e) => setBannerForm({ ...bannerForm, heading_ta: e.target.value })}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Subtext (English)"
                value={bannerForm.subtext_en}
                onChange={(e) => setBannerForm({ ...bannerForm, subtext_en: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
              <TextField
                label="Subtext (Tamil)"
                value={bannerForm.subtext_ta}
                onChange={(e) => setBannerForm({ ...bannerForm, subtext_ta: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Image URL"
                value={bannerForm.image_url}
                onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })}
                fullWidth
                placeholder="https://..."
              />
              <TextField
                label="Mobile Image URL"
                value={bannerForm.mobile_image_url}
                onChange={(e) => setBannerForm({ ...bannerForm, mobile_image_url: e.target.value })}
                fullWidth
                placeholder="https://..."
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="CTA Text (English)"
                value={bannerForm.cta_text_en}
                onChange={(e) => setBannerForm({ ...bannerForm, cta_text_en: e.target.value })}
                fullWidth
                placeholder="e.g., Learn More"
              />
              <TextField
                label="CTA Link"
                value={bannerForm.cta_link}
                onChange={(e) => setBannerForm({ ...bannerForm, cta_link: e.target.value })}
                fullWidth
                placeholder="https://..."
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Date"
                type="datetime-local"
                value={bannerForm.start_date}
                onChange={(e) => setBannerForm({ ...bannerForm, start_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Date"
                type="datetime-local"
                value={bannerForm.end_date}
                onChange={(e) => setBannerForm({ ...bannerForm, end_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Display Order"
                type="number"
                value={bannerForm.display_order}
                onChange={(e) => setBannerForm({ ...bannerForm, display_order: parseInt(e.target.value) || 0 })}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={bannerForm.is_active}
                    onChange={(e) => setBannerForm({ ...bannerForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBannerDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveBanner} disabled={bannerSaving}>
            {bannerSaving ? 'Saving...' : editingBanner ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* ASSISTANCE STATUS UPDATE DIALOG */}
      {/* ============================================ */}
      <Dialog open={assistanceDialogOpen} onClose={closeAssistanceDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Update Assistance Request</DialogTitle>
        <DialogContent>
          {editingAssistance && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{editingAssistance.student_name}</strong> - {editingAssistance.phone}
                  {editingAssistance.district && ` (${editingAssistance.district})`}
                </Typography>
                {editingAssistance.school_name && (
                  <Typography variant="body2" color="text.secondary">
                    School: {editingAssistance.school_name}
                  </Typography>
                )}
              </Alert>
              <TextField
                select
                label="Status"
                value={assistanceForm.status}
                onChange={(e) => setAssistanceForm({ ...assistanceForm, status: e.target.value })}
                fullWidth
              >
                {ASSISTANCE_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Assigned To"
                value={assistanceForm.assigned_to}
                onChange={(e) => setAssistanceForm({ ...assistanceForm, assigned_to: e.target.value })}
                fullWidth
                placeholder="Staff member name"
              />
              <TextField
                label="Notes"
                value={assistanceForm.notes}
                onChange={(e) => setAssistanceForm({ ...assistanceForm, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
                placeholder="Internal notes about this request..."
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAssistanceDialog}>Cancel</Button>
          <Button variant="contained" onClick={saveAssistance} disabled={assistanceSaving}>
            {assistanceSaving ? 'Saving...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* SNACKBAR */}
      {/* ============================================ */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
