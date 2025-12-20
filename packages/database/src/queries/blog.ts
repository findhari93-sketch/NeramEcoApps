// @ts-nocheck - Supabase types not generated
/**
 * Blog Queries
 *
 * Database queries for blog posts in the marketing website
 */

import { getSupabaseBrowserClient, createServerClient } from '../client';
import type { BlogPost } from '../types';

type Locale = 'en' | 'ta' | 'hi' | 'kn' | 'ml';

/**
 * Get published blog posts with pagination
 */
export async function getBlogPosts(
  locale: Locale = 'en',
  limit: number = 10,
  offset: number = 0,
  category?: string
) {
  const supabase = getSupabaseBrowserClient();

  let query = supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }

  // Transform to locale-specific content
  return data.map((post) => ({
    ...post,
    title: post.title[locale] || post.title['en'],
    excerpt: post.excerpt[locale] || post.excerpt['en'],
    content: post.content[locale] || post.content['en'],
    meta_title: post.meta_title?.[locale] || post.meta_title?.['en'] || null,
    meta_description: post.meta_description?.[locale] || post.meta_description?.['en'] || null,
  }));
}

/**
 * Get a single blog post by slug
 */
export async function getBlogPostBySlug(slug: string, locale: Locale = 'en') {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    console.error('Error fetching blog post:', error);
    return null;
  }

  // Transform to locale-specific content
  return {
    ...data,
    title: data.title[locale] || data.title['en'],
    excerpt: data.excerpt[locale] || data.excerpt['en'],
    content: data.content[locale] || data.content['en'],
    meta_title: data.meta_title?.[locale] || data.meta_title?.['en'] || null,
    meta_description: data.meta_description?.[locale] || data.meta_description?.['en'] || null,
  };
}

/**
 * Get blog posts by category
 */
export async function getBlogPostsByCategory(
  category: string,
  locale: Locale = 'en',
  limit: number = 10
) {
  return getBlogPosts(locale, limit, 0, category);
}

/**
 * Get all blog slugs for static generation
 */
export async function getAllBlogSlugs() {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published');

  if (error) {
    console.error('Error fetching blog slugs:', error);
    return [];
  }

  return data.map((post) => post.slug);
}

/**
 * Get blog categories
 */
export async function getBlogCategories() {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('category')
    .eq('status', 'published');

  if (error) {
    console.error('Error fetching blog categories:', error);
    return [];
  }

  // Get unique categories
  const categories = [...new Set(data.map((post) => post.category))];
  return categories;
}

/**
 * Increment blog post view count
 */
export async function incrementBlogViewCount(postId: string) {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.rpc('increment_blog_view', { post_id: postId });

  if (error) {
    console.error('Error incrementing view count:', error);
  }
}

/**
 * Get related blog posts
 */
export async function getRelatedBlogPosts(
  currentSlug: string,
  category: string,
  locale: Locale = 'en',
  limit: number = 3
) {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .eq('category', category)
    .neq('slug', currentSlug)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching related posts:', error);
    return [];
  }

  return data.map((post) => ({
    ...post,
    title: post.title[locale] || post.title['en'],
    excerpt: post.excerpt[locale] || post.excerpt['en'],
  }));
}
