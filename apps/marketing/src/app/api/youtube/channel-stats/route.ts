import { NextResponse } from 'next/server';

// Support both server-only and NEXT_PUBLIC_ prefixed env vars
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID;

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  viewCount: string;
  publishedAt: string;
}

interface ChannelStats {
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  channelId: string;
  videos: YouTubeVideo[];
}

// Cache the response for 1 hour
export const revalidate = 3600;

export async function GET() {
  try {
    if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) {
      console.warn('YouTube API key or channel ID not configured');
      return NextResponse.json(getMockResponse());
    }

    // Get channel statistics
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${YOUTUBE_CHANNEL_ID}&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!channelResponse.ok) {
      const errorText = await channelResponse.text();
      console.error('YouTube channel API error:', channelResponse.status, errorText);
      return NextResponse.json(getMockResponse());
    }

    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      console.error('No channel found for ID:', YOUTUBE_CHANNEL_ID);
      return NextResponse.json(getMockResponse());
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const statistics = channel.statistics;

    const subscriberCount = formatCount(parseInt(statistics.subscriberCount || '0'));
    const videoCount = statistics.videoCount || '0';
    const viewCount = formatCount(parseInt(statistics.viewCount || '0'));

    // Get popular videos from the channel
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=6&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    let videos: YouTubeVideo[] = [];

    if (videosResponse.ok) {
      const videosData = await videosResponse.json();

      if (videosData.items && videosData.items.length > 0) {
        // Get video statistics for accurate view counts
        const videoIds = videosData.items
          .map((item: { id: { videoId: string } }) => item.id.videoId)
          .join(',');

        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`,
          { next: { revalidate: 3600 } }
        );

        const statsData = statsResponse.ok ? await statsResponse.json() : { items: [] };
        const statsMap = new Map(
          statsData.items?.map((item: { id: string; statistics: { viewCount: string } }) => [
            item.id,
            item.statistics.viewCount,
          ]) || []
        );

        videos = videosData.items.map(
          (item: {
            id: { videoId: string };
            snippet: {
              title: string;
              thumbnails: {
                high?: { url: string };
                medium?: { url: string };
                default?: { url: string };
              };
              publishedAt: string;
            };
          }) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            thumbnail:
              item.snippet.thumbnails.high?.url ||
              item.snippet.thumbnails.medium?.url ||
              item.snippet.thumbnails.default?.url ||
              '',
            viewCount: formatCount(
              parseInt((statsMap.get(item.id.videoId) as string) || '0')
            ),
            publishedAt: item.snippet.publishedAt,
          })
        );
      }
    } else {
      console.error('YouTube search API error:', videosResponse.status);
    }

    if (videos.length === 0) {
      videos = getMockVideos();
    }

    const result: ChannelStats = {
      subscriberCount,
      videoCount,
      viewCount,
      channelId,
      videos,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('YouTube API error:', error);
    return NextResponse.json(getMockResponse());
  }
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

function getMockResponse(): ChannelStats {
  return {
    subscriberCount: '10K+',
    videoCount: '100+',
    viewCount: '500K+',
    channelId: '',
    videos: getMockVideos(),
  };
}

function getMockVideos(): YouTubeVideo[] {
  return [
    {
      id: 'mock1',
      title: 'NATA 2025 Complete Preparation Strategy',
      thumbnail: '',
      viewCount: '50K',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock2',
      title: 'JEE Paper 2 Architecture - Important Topics',
      thumbnail: '',
      viewCount: '35K',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock3',
      title: 'Drawing Techniques for Architecture Entrance',
      thumbnail: '',
      viewCount: '28K',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock4',
      title: 'NATA Aptitude Test - Tips & Tricks',
      thumbnail: '',
      viewCount: '22K',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock5',
      title: 'Architecture College Selection Guide 2025',
      thumbnail: '',
      viewCount: '18K',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'mock6',
      title: 'Perspective Drawing Masterclass',
      thumbnail: '',
      viewCount: '15K',
      publishedAt: new Date().toISOString(),
    },
  ];
}
