import { describe, it, expect } from 'vitest';
import { buildChannelReport, pageLabel } from './lead-channels';

describe('lead channel report', () => {
  it('labels location pages', () => {
    expect(pageLabel('/coaching/nata-coaching/nata-coaching-centers-in-madurai')).toBe('City: madurai');
    expect(pageLabel('/coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-trichy')).toBe('City: trichy');
    expect(pageLabel('/coaching/nata-coaching-in-tamil-nadu')).toBe('State: tamil-nadu');
    expect(pageLabel('/fees?x=1')).toBe('/fees');
    expect(pageLabel(null)).toBe('Not recorded');
  });

  it('counts leads by channel and table, pages by total, and the AI share', () => {
    const r = buildChannelReport([
      { table: 'demo_class_registrations', channel: 'ai_chatgpt', landing_page: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', page_code: 'EN-MDU' },
      { table: 'callback_requests', channel: 'ai_chatgpt', landing_page: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', page_code: null },
      { table: 'callback_requests', channel: 'google_organic', landing_page: '/', page_code: null },
      { table: 'center_visit_bookings', channel: null, landing_page: null, page_code: null },
    ]);
    expect(r.total).toBe(4);
    expect(r.byChannel[0]).toMatchObject({ channel: 'ai_chatgpt', label: 'ChatGPT', total: 2 });
    expect(r.byChannel[0].byTable.callback_requests).toBe(1);
    expect(r.byChannel.find((c) => c.channel === 'unknown')?.label).toBe('Not recorded');
    expect(r.byPage[0]).toEqual({ page: 'City: madurai', total: 2, topChannel: 'ChatGPT' });
    expect(r.aiShare).toBe(50);
  });

  it('handles no leads', () => {
    expect(buildChannelReport([])).toEqual({ total: 0, byChannel: [], byPage: [], aiShare: 0 });
  });
});
