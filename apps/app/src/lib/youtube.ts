/**
 * YouTube API Helper Functions
 *
 * This module provides functions for interacting with the YouTube Data API v3
 * for subscription management and channel data retrieval.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeSubscription {
  id: string;
  channelId: string;
  subscribedAt: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscription?: YouTubeSubscription;
  error?: string;
  alreadySubscribed?: boolean;
}

export interface ChannelInfo {
  id: string;
  title: string;
  subscriberCount: string;
  videoCount: string;
}

/**
 * Subscribe the authenticated user to a YouTube channel
 * Requires OAuth access token with youtube.force-ssl scope
 */
export async function subscribeToChannel(
  accessToken: string,
  channelId: string
): Promise<SubscriptionResult> {
  try {
    // First check if already subscribed
    const existingSubscription = await checkSubscription(accessToken, channelId);
    if (existingSubscription.isSubscribed) {
      return {
        success: true,
        subscription: existingSubscription.subscription,
        alreadySubscribed: true,
      };
    }

    // Create new subscription
    const response = await fetch(`${YOUTUBE_API_BASE}/subscriptions?part=snippet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          resourceId: {
            kind: 'youtube#channel',
            channelId: channelId,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Handle "already subscribed" error
      if (
        errorData.error?.code === 400 &&
        errorData.error?.errors?.[0]?.reason === 'subscriptionDuplicate'
      ) {
        // Re-check subscription to get details
        const recheck = await checkSubscription(accessToken, channelId);
        return {
          success: true,
          subscription: recheck.subscription,
          alreadySubscribed: true,
        };
      }

      console.error('YouTube subscription error:', errorData);
      return {
        success: false,
        error: errorData.error?.message || 'Failed to subscribe to channel',
      };
    }

    const data = await response.json();

    return {
      success: true,
      subscription: {
        id: data.id,
        channelId: data.snippet.resourceId.channelId,
        subscribedAt: data.snippet.publishedAt,
      },
    };
  } catch (error) {
    console.error('Error subscribing to channel:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Check if the authenticated user is subscribed to a channel
 * Requires OAuth access token with youtube.force-ssl scope
 */
export async function checkSubscription(
  accessToken: string,
  channelId: string
): Promise<{ isSubscribed: boolean; subscription?: YouTubeSubscription }> {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/subscriptions?part=snippet&mine=true&forChannelId=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Error checking subscription:', await response.text());
      return { isSubscribed: false };
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return {
        isSubscribed: true,
        subscription: {
          id: item.id,
          channelId: item.snippet.resourceId.channelId,
          subscribedAt: item.snippet.publishedAt,
        },
      };
    }

    return { isSubscribed: false };
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { isSubscribed: false };
  }
}

/**
 * Get channel information using API key (no OAuth required)
 */
export async function getChannelInfo(
  apiKey: string,
  channelId: string
): Promise<ChannelInfo | null> {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
    );

    if (!response.ok) {
      console.error('Error fetching channel info:', await response.text());
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      subscriberCount: channel.statistics.subscriberCount,
      videoCount: channel.statistics.videoCount,
    };
  } catch (error) {
    console.error('Error fetching channel info:', error);
    return null;
  }
}

/**
 * Get channel ID from handle (e.g., @neramclassesnata)
 */
export async function getChannelIdFromHandle(
  apiKey: string,
  handle: string
): Promise<string | null> {
  try {
    // Remove @ if present
    const cleanHandle = handle.replace('@', '');

    const response = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=id&forHandle=${cleanHandle}&key=${apiKey}`
    );

    if (!response.ok) {
      console.error('Error fetching channel ID:', await response.text());
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return null;
    }

    return data.items[0].id;
  } catch (error) {
    console.error('Error fetching channel ID:', error);
    return null;
  }
}

/**
 * Generate Google OAuth URL for YouTube subscription
 */
export function generateYouTubeOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
} | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      console.error('Token exchange error:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    return null;
  }
}

/**
 * Get user info from Google OAuth
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture: string;
} | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Error fetching user info:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}
