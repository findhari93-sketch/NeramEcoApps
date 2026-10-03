import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { getCachedAskSeniorsEvent, getCachedAskSeniorsColleges } from '@/lib/ask-seniors-data'
import AskSeniorsPageContent from '@/components/ask-seniors/AskSeniorsPageContent'

// ISR daily; admin event edits purge the "ask-seniors" tag via /api/revalidate.
export const revalidate = 86400

export const metadata: Metadata = {
  title: '#AskSeniors 2026: Free B.Arch College Q&A Event',
  alternates: { canonical: 'https://neramclasses.com/ask-seniors' },
  description:
    'Join AskSeniors, a free annual online event where current B.Arch students from 50+ colleges answer your counselling questions before TNEA. Register now.',
  openGraph: {
    title: '#AskSeniors 2026 by Neram Classes',
    description: 'Real students. Real answers. Before TNEA counselling.',
    type: 'website',
  },
}

interface PageProps {
  params: { locale: string }
}

export default async function AskSeniorsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale)

  const [event, colleges] = await Promise.all([
    getCachedAskSeniorsEvent(),
    getCachedAskSeniorsColleges(),
  ])

  if (!event) {
    notFound()
  }

  return <AskSeniorsPageContent event={event} colleges={colleges} />
}
