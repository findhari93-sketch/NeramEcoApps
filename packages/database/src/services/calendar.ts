/**
 * Neram Classes - Calendar Service
 *
 * Generate .ics calendar files for demo class invitations
 */

export interface CalendarEvent {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  meetingLink?: string;
  organizer?: {
    name: string;
    email: string;
  };
}

/**
 * Generate a unique identifier for the event
 */
function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}@neramclasses.com`;
}

/**
 * Format date for ICS (YYYYMMDDTHHMMSSZ format)
 */
function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Escape special characters for ICS format
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long lines according to ICS spec (max 75 chars)
 */
function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) return line;

  const lines: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    lines.push(remaining.substring(0, maxLength));
    remaining = ' ' + remaining.substring(maxLength);
  }
  lines.push(remaining);

  return lines.join('\r\n');
}

/**
 * Generate .ics file content for a calendar event
 */
export function generateICSFile(event: CalendarEvent): string {
  const uid = generateUID();
  const now = new Date();

  // Build description with meeting link if provided
  let description = event.description;
  if (event.meetingLink) {
    description += `\\n\\nJoin Meeting: ${event.meetingLink}`;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neram Classes//Demo Class Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDateForICS(now)}`,
    `DTSTART:${formatDateForICS(event.startTime)}`,
    `DTEND:${formatDateForICS(event.endTime)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
  ];

  // Add location if provided
  if (event.location) {
    lines.push(`LOCATION:${escapeICSText(event.location)}`);
  }

  // Add meeting URL if provided (as a clickable link in calendar apps)
  if (event.meetingLink) {
    lines.push(`URL:${event.meetingLink}`);
  }

  // Add organizer if provided
  if (event.organizer) {
    lines.push(`ORGANIZER;CN=${escapeICSText(event.organizer.name)}:mailto:${event.organizer.email}`);
  }

  // Add alarm reminders
  lines.push(
    // 1 day before
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Demo Class Tomorrow',
    'END:VALARM',
    // 1 hour before
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Demo Class Starting Soon',
    'END:VALARM',
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // Fold long lines and join with CRLF
  return lines.map(foldLine).join('\r\n');
}

/**
 * Generate ICS file for a demo class slot
 */
export function generateDemoClassICS(options: {
  title: string;
  slotDate: string;        // YYYY-MM-DD
  slotTime: string;        // HH:mm:ss
  durationMinutes: number;
  meetingLink?: string;
  venueAddress?: string;
  description?: string;
}): string {
  const { title, slotDate, slotTime, durationMinutes, meetingLink, venueAddress, description } = options;

  // Parse date and time
  const [year, month, day] = slotDate.split('-').map(Number);
  const [hours, minutes] = slotTime.split(':').map(Number);

  // Create start time (assuming IST timezone, convert to UTC)
  const startTime = new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30)); // IST is UTC+5:30
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  // Build description
  let fullDescription = description || 'Join us for a free demo class to experience our teaching methodology.';
  fullDescription += '\\n\\nNeram Classes';
  fullDescription += '\\nWebsite: https://neramclasses.com';
  fullDescription += '\\nPhone: +91 XXXXXXXXXX';

  return generateICSFile({
    title,
    description: fullDescription,
    startTime,
    endTime,
    location: venueAddress || (meetingLink ? 'Online (see meeting link)' : undefined),
    meetingLink,
    organizer: {
      name: 'Neram Classes',
      email: 'notifications@neramclasses.com',
    },
  });
}

/**
 * Generate a data URL for the ICS file (for download button)
 */
export function generateICSDataUrl(icsContent: string): string {
  const base64Content = Buffer.from(icsContent).toString('base64');
  return `data:text/calendar;base64,${base64Content}`;
}

/**
 * Generate a Google Calendar URL for the event
 */
export function generateGoogleCalendarUrl(options: {
  title: string;
  slotDate: string;
  slotTime: string;
  durationMinutes: number;
  description?: string;
  location?: string;
}): string {
  const { title, slotDate, slotTime, durationMinutes, description, location } = options;

  // Parse and format dates for Google Calendar
  const [year, month, day] = slotDate.split('-').map(Number);
  const [hours, minutes] = slotTime.split(':').map(Number);

  const startDate = new Date(year, month - 1, day, hours, minutes);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  // Format as YYYYMMDDTHHMMSS (local time, no Z)
  const formatForGoogle = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0];
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatForGoogle(startDate)}/${formatForGoogle(endDate)}`,
    details: description || 'Free Demo Class - Neram Classes',
    location: location || 'Online',
    ctz: 'Asia/Kolkata',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate an Outlook Calendar URL for the event
 */
export function generateOutlookCalendarUrl(options: {
  title: string;
  slotDate: string;
  slotTime: string;
  durationMinutes: number;
  description?: string;
  location?: string;
}): string {
  const { title, slotDate, slotTime, durationMinutes, description, location } = options;

  const [year, month, day] = slotDate.split('-').map(Number);
  const [hours, minutes] = slotTime.split(':').map(Number);

  const startDate = new Date(year, month - 1, day, hours, minutes);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: startDate.toISOString(),
    enddt: endDate.toISOString(),
    body: description || 'Free Demo Class - Neram Classes',
    location: location || 'Online',
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
