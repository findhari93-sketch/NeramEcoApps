import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { getActiveAskSeniorsEvent, getAskSeniorsColleges } from '@neram/database'
import AskSeniorsPageContent from '@/components/ask-seniors/AskSeniorsPageContent'

export const revalidate = 3600

export const metadata: Metadata = {
  title: '#AskSeniors 2026 — Free B.Arch College Q&A Event | Neram Classes',
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
    getActiveAskSeniorsEvent(),
    getAskSeniorsColleges(),
  ])

  if (!event) {
    notFound()
  }

  return <AskSeniorsPageContent event={event} colleges={colleges} />
}
