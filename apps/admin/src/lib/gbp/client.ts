/**
 * A small Google Business Profile API client: just the calls the review sync
 * needs. fetch is injected so the tests never touch the network.
 *
 * APIs used (each must be enabled in the Google Cloud project, and the Business
 * Profile APIs need Google's access approval first):
 *   - OAuth token refresh            oauth2.googleapis.com/token
 *   - Business Information v1        locations.list (to find each centre's location)
 *   - My Business v4                 reviews.list, reviews.updateReply, localPosts.create
 * The v4 reviews API is the only one Google offers for reviews; it is read and
 * reply only. There is no call that creates a review, by design.
 */
import type { ApiReview, GbpConfig } from './core';

type Fetch = typeof fetch;

export interface ApiLocation {
  /** "locations/1234567890" */
  name: string;
  title?: string;
  metadata?: { placeId?: string; mapsUri?: string; newReviewUri?: string };
}

export class GbpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class GbpClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: GbpConfig, private readonly fetchImpl: Fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) throw new GbpError(`Google sign-in failed (${body.error || res.status})`, res.status);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
    return body.access_token;
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new GbpError(body?.error?.message || `Google API error ${res.status}`, res.status);
    return body;
  }

  /** Every location on the account, with its placeId so centres can be matched. */
  async listLocations(): Promise<ApiLocation[]> {
    const out: ApiLocation[] = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ readMask: 'name,title,metadata', pageSize: '100' });
      if (pageToken) q.set('pageToken', pageToken);
      const body = await this.call<{ locations?: ApiLocation[]; nextPageToken?: string }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${this.config.accountId}/locations?${q}`,
      );
      out.push(...(body.locations || []));
      pageToken = body.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  /** All reviews for a location, newest first, plus Google's own totals. */
  async listReviews(locationName: string, maxPages = 10): Promise<{ reviews: ApiReview[]; averageRating: number | null; totalReviewCount: number | null }> {
    const reviews: ApiReview[] = [];
    let pageToken = '';
    let averageRating: number | null = null;
    let totalReviewCount: number | null = null;
    let pages = 0;
    do {
      const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
      if (pageToken) q.set('pageToken', pageToken);
      const body = await this.call<{ reviews?: ApiReview[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(
        `https://mybusiness.googleapis.com/v4/accounts/${this.config.accountId}/${locationName}/reviews?${q}`,
      );
      reviews.push(...(body.reviews || []));
      if (body.averageRating != null) averageRating = body.averageRating;
      if (body.totalReviewCount != null) totalReviewCount = body.totalReviewCount;
      pageToken = body.nextPageToken || '';
      pages += 1;
    } while (pageToken && pages < maxPages);
    return { reviews, averageRating, totalReviewCount };
  }

  /** Post (or replace) the owner reply on a review. */
  async updateReply(reviewName: string, comment: string): Promise<{ comment: string; updateTime?: string }> {
    return this.call(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    });
  }

  /** A "What's new" Update on a location's profile. */
  async createLocalPost(locationName: string, summary: string, url: string): Promise<{ name: string }> {
    return this.call(`https://mybusiness.googleapis.com/v4/accounts/${this.config.accountId}/${locationName}/localPosts`, {
      method: 'POST',
      body: JSON.stringify({
        languageCode: 'en-IN',
        summary,
        topicType: 'STANDARD',
        callToAction: { actionType: 'LEARN_MORE', url },
      }),
    });
  }
}
