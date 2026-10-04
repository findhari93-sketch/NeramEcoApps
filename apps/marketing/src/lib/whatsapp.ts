/**
 * One builder for every WhatsApp link on the site: the number is ORG_PHONE,
 * the pre-filled message names the city in the visitor's language,
 * and a page code (e.g. "EN-MDU") tells staff which page the chat came from.
 */
// constants.ts, not facts.ts: facts.ts imports the server-only Supabase client and this file runs in the browser.
import { ORG_PHONE } from '@/lib/seo/constants';

export type WhatsAppLang = 'en' | 'ta' | 'kn' | 'hi' | 'ml';

/** Short codes staff recognise; any other city uses its first three letters. */
const CITY_CODES: Record<string, string> = {
  chennai: 'CHN',
  tambaram: 'TBM',
  kanchipuram: 'KPM',
  coimbatore: 'CBE',
  tiruppur: 'TPR',
  trichy: 'TRY',
  madurai: 'MDU',
  pudukkottai: 'PDK',
  bangalore: 'BLR',
};

/**
 * A separate number for Kannada chats, once the founder supplies it
 * (DATA_NEEDED in agents/seo-aeo/PROGRESS.md). Until then Kannada uses the main number.
 */
const KANNADA_WHATSAPP: string | null = null;

const digits = (phone: string) => phone.replace(/\D/g, '');

export function cityCode(citySlug: string | null | undefined): string {
  if (!citySlug) return 'WEB';
  return CITY_CODES[citySlug] ?? citySlug.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
}

export function pageCode(lang: WhatsAppLang, citySlug?: string | null): string {
  return `${lang.toUpperCase()}-${cityCode(citySlug)}`;
}

function message(lang: WhatsAppLang, city: string | null, code: string): string {
  const tag = `[${code}]`;
  switch (lang) {
    case 'ta':
      return city
        ? `வணக்கம் நேரம், நான் ${city}-லிருந்து. NATA பயிற்சி பற்றி தெரிந்துகொள்ள விரும்புகிறேன். ${tag}`
        : `வணக்கம் நேரம், NATA பயிற்சி பற்றி தெரிந்துகொள்ள விரும்புகிறேன். ${tag}`;
    case 'kn':
      return city
        ? `ನಮಸ್ಕಾರ ನೇರಂ, ನಾನು ${city} ಇಂದ. NATA ಕೋಚಿಂಗ್ ಬಗ್ಗೆ ತಿಳಿಯಲು ಬಯಸುತ್ತೇನೆ. ${tag}`
        : `ನಮಸ್ಕಾರ ನೇರಂ, NATA ಕೋಚಿಂಗ್ ಬಗ್ಗೆ ತಿಳಿಯಲು ಬಯಸುತ್ತೇನೆ. ${tag}`;
    case 'hi':
      return city
        ? `नमस्ते नेरम, मैं ${city} से हूँ। NATA कोचिंग के बारे में जानना चाहता/चाहती हूँ। ${tag}`
        : `नमस्ते नेरम, NATA कोचिंग के बारे में जानना चाहता/चाहती हूँ। ${tag}`;
    default:
      return city
        ? `Hi Neram, I'm from ${city}. I'd like to know about NATA coaching. ${tag}`
        : `Hi Neram, I'd like to know about NATA coaching. ${tag}`;
  }
}

export interface WhatsAppLinkInput {
  lang?: WhatsAppLang;
  /** City name shown in the message, e.g. "Madurai". */
  city?: string | null;
  /** City page slug, used for the page code. */
  citySlug?: string | null;
  /** Replace the default message (e.g. scholarship questions). The page code is still appended. */
  text?: string;
}

export function buildWhatsAppLink({ lang = 'en', city = null, citySlug = null, text }: WhatsAppLinkInput = {}): {
  href: string;
  pageCode: string;
} {
  const code = pageCode(lang, citySlug);
  const number = digits(lang === 'kn' && KANNADA_WHATSAPP ? KANNADA_WHATSAPP : ORG_PHONE);
  const body = text ? `${text} [${code}]` : message(lang, city, code);
  return { href: `https://wa.me/${number}?text=${encodeURIComponent(body)}`, pageCode: code };
}
