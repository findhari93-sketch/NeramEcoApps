'use client';

import {
  Box,
  Typography,
  Paper,
  Chip,
  Alert,
} from '@neram/ui';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ForumIcon from '@mui/icons-material/Forum';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import EditNoteIcon from '@mui/icons-material/EditNote';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ color: 'primary.main' }}>{icon}</Box>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
      </Box>
      {children}
    </Paper>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
      <Box
        sx={{
          width: 28, height: 28, borderRadius: '50%', bgcolor: 'primary.main',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0, mt: 0.2,
        }}
      >
        {number}
      </Box>
      <Box>
        <Typography variant="body1" fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
      </Box>
    </Box>
  );
}

function Tip({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ color: 'success.main', mt: 0.2 }}>{icon}</Box>
      <Box>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{text}</Typography>
      </Box>
    </Box>
  );
}

export default function AintraGuidePage() {
  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <MenuBookIcon color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Aintra Training Guide</Typography>
          <Typography variant="body2" color="text.secondary">
            How to review conversations and teach Aintra to give better answers
          </Typography>
        </Box>
      </Box>

      {/* What is Aintra */}
      <Section icon={<SmartToyIcon />} title="What is Aintra?">
        <Typography variant="body2" paragraph>
          <strong>Aintra</strong> is Neram Classes' AI chat assistant, powered by Google Gemini. It handles student queries on the website — covering NATA exam info, course details, fees, timings, and admissions.
        </Typography>
        <Typography variant="body2" paragraph>
          Aintra uses two sources of knowledge:
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 200 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>Built-in Knowledge</Typography>
            <Typography variant="body2" color="text.secondary">
              Hardcoded facts about NATA 2026 — exam dates, pattern, fees, eligibility. Updated only via code deployments.
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 200 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>Dynamic Knowledge Base</Typography>
            <Typography variant="body2" color="text.secondary">
              Q&A pairs managed by admin staff (you!). Changes take effect within 5 minutes — no deployment needed.
            </Typography>
          </Paper>
        </Box>
      </Section>

      {/* How Aintra Learns */}
      <Section icon={<ArrowForwardIcon />} title="How Aintra Learns">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The feedback loop — from student question to Aintra improvement:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          {[
            { icon: <ForumIcon sx={{ fontSize: 16 }} />, label: 'Student asks' },
            { label: '→' },
            { icon: <SmartToyIcon sx={{ fontSize: 16 }} />, label: 'Aintra answers' },
            { label: '→' },
            { icon: <ThumbUpIcon sx={{ fontSize: 16 }} />, label: 'Admin rates' },
            { label: '→' },
            { icon: <EditNoteIcon sx={{ fontSize: 16 }} />, label: 'Admin corrects' },
            { label: '→' },
            { icon: <AddCircleOutlineIcon sx={{ fontSize: 16 }} />, label: 'Added to KB' },
            { label: '→' },
            { icon: <SmartToyIcon sx={{ fontSize: 16 }} />, label: 'Aintra improves' },
          ].map((step, i) =>
            step.label === '→' ? (
              <Typography key={i} variant="body2" color="text.disabled" fontWeight={700}>→</Typography>
            ) : (
              <Chip
                key={i}
                icon={step.icon}
                label={step.label}
                size="small"
                variant="outlined"
              />
            )
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          When you add a corrected answer to the Knowledge Base, Aintra uses it for all future similar questions — usually within 5 minutes.
        </Typography>
      </Section>

      {/* How to Train Aintra */}
      <Section icon={<EditNoteIcon />} title="How to Train Aintra (Step-by-Step)">
        <Step
          number={1}
          title="Open Chat History"
          description="Go to Chat History in the sidebar. You'll see all recent student conversations with Aintra, newest first."
        />
        <Step
          number={2}
          title="Review AI answers"
          description="Read the AI Answer column. Look for answers that are wrong, incomplete, or could be clearer."
        />
        <Step
          number={3}
          title="Thumbs-up good answers"
          description="Click the thumbs-up icon on answers that are accurate and helpful. This flags them as high-quality for reference."
        />
        <Step
          number={4}
          title="Write a correction for bad answers"
          description="Click 'Add' in the Correction column to open the correction dialog. Type a better, accurate answer in the text box and click Save Correction."
        />
        <Step
          number={5}
          title="Promote to Aintra's Knowledge Base"
          description="After saving a correction, click 'Add to Aintra KB'. This teaches Aintra the correct answer for similar future questions. A green checkmark confirms it's been added."
        />
        <Step
          number={6}
          title="Add proactive Q&As"
          description="Go to Aintra Training in the sidebar to add new Q&A pairs for topics students frequently ask about — even before getting the question wrong."
        />
      </Section>

      {/* KB Best Practices */}
      <Section icon={<CheckCircleOutlineIcon />} title="Knowledge Base Best Practices">
        <Tip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
          label="Be specific, not vague"
          text='Instead of "fees vary", write the exact fee: "The 1-Year Program costs ₹25,000 (single payment) or ₹30,000 (installments)."'
        />
        <Tip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
          label="Keep answers under 200 words"
          text="Aintra injects your answer directly into its response. Short, clear answers work better than long paragraphs."
        />
        <Tip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
          label="Use the right category"
          text="Pick the most specific category (Fees, Courses, NATA Exam, etc.) so answers are easy to find and manage."
        />
        <Tip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
          label="Test after adding"
          text="After adding a KB item, wait 5 minutes, then ask Aintra the same question on the website to verify the new answer appears."
        />
        <Tip
          icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
          label="Update outdated items"
          text="When fees, timings, or policies change — update the KB item immediately. Outdated info will be served as fact until corrected."
        />
      </Section>

      {/* What NOT to add */}
      <Section icon={<WarningAmberIcon />} title="What NOT to Add to the Knowledge Base">
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aintra presents KB content as factual. Incorrect or inappropriate entries will mislead students.
        </Alert>
        <Box component="ul" sx={{ pl: 2, m: 0 }}>
          {[
            'Unverified information or guesses — only add facts you are sure about',
            'Sensitive internal data — pricing strategies, staff salaries, internal policies',
            'Competitor names or comparisons — focus only on Neram Classes',
            'Legal or medical advice — Aintra is not qualified for this',
            'Temporary promotions without an expiry plan — remove or update when the offer ends',
          ].map((item) => (
            <Box component="li" key={item} sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">{item}</Typography>
            </Box>
          ))}
        </Box>
      </Section>

      {/* Quick links */}
      <Paper sx={{ p: 2.5, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
        <Typography variant="body2" fontWeight={600} gutterBottom>Quick Links</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1 }}>
          <Chip label="Chat History" icon={<ForumIcon />} component="a" href="/chat-history" clickable size="small" />
          <Chip label="Aintra Training (KB)" icon={<SmartToyIcon />} component="a" href="/aintra-kb" clickable size="small" />
        </Box>
      </Paper>
    </Box>
  );
}
