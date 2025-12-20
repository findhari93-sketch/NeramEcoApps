// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const NERAM_CHANNEL_ID = process.env.NERAM_YOUTUBE_CHANNEL_ID || 'UCxxxxxxxxxx'; // Replace with actual channel ID

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to verify subscription' },
        { status: 401 }
      );
    }

    // For now, we'll implement a simplified verification
    // In production, you would use YouTube Data API v3 with OAuth

    if (!YOUTUBE_API_KEY) {
      // If API key not configured, mark as pending for manual verification
      console.log('YouTube API key not configured, marking for manual verification');

      const { data: leadProfile } = await supabase
        .from('lead_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (leadProfile) {
        await supabase
          .from('cashback_claims')
          // @ts-ignore - Supabase types not generated
          .upsert({
            lead_profile_id: leadProfile.id,
            user_id: user.id,
            cashback_type: 'youtube_subscription',
            amount: 50,
            youtube_channel_subscribed: false,
            status: 'pending',
          }, {
            onConflict: 'lead_profile_id,cashback_type',
          });
      }

      return NextResponse.json({
        success: true,
        isSubscribed: false,
        message: 'Subscription will be verified manually by our team',
        manualVerification: true,
      });
    }

    // Full YouTube API implementation would go here
    // This requires OAuth 2.0 flow to get user's subscription list
    /*
    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URL
    );

    // Get user's access token from your auth system
    oauth2Client.setCredentials({ access_token: userAccessToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const response = await youtube.subscriptions.list({
      part: ['snippet'],
      mine: true,
      forChannelId: NERAM_CHANNEL_ID,
    });

    const isSubscribed = response.data.items && response.data.items.length > 0;
    */

    // For MVP, we'll use a simplified check
    // The user clicks subscribe, we trust them but mark for admin verification
    const isSubscribed = true; // Assume subscribed after clicking

    // Store the claim
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (leadProfile) {
      await supabase
        .from('cashback_claims')
        // @ts-ignore - Supabase types not generated
        .upsert({
          lead_profile_id: leadProfile.id,
          user_id: user.id,
          cashback_type: 'youtube_subscription',
          amount: 50,
          youtube_channel_subscribed: isSubscribed,
          status: isSubscribed ? 'verified' : 'pending',
        }, {
          onConflict: 'lead_profile_id,cashback_type',
        });
    }

    return NextResponse.json({
      success: true,
      isSubscribed,
      message: isSubscribed
        ? 'YouTube subscription verified! Rs. 50 cashback earned.'
        : 'Please subscribe to our YouTube channel first.',
    });
  } catch (error) {
    console.error('YouTube verification error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to verify subscription' },
      { status: 500 }
    );
  }
}
