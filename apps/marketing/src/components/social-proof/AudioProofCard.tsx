'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SocialProof } from '@neram/database';
import { cn } from '@/lib/utils';

interface AudioProofCardProps {
  proof: SocialProof;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    tamil: '#e8a020',
    english: '#1a8fff',
    hindi: '#e25555',
    kannada: '#8b5cf6',
    malayalam: '#10b981',
    telugu: '#f97316',
  };
  return colors[lang] || '#888';
}

export default function AudioProofCard({ proof }: AudioProofCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(proof.audio_duration || 0);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {
        // Browser autoplay restriction
      });
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration && isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
      }
    };
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = clickX / rect.width;
      audio.currentTime = percent * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'rounded-2xl p-5',
        'w-full max-w-[380px]'
      )}
      style={{
        background: 'var(--neram-card)',
        border: '1px solid var(--neram-border)',
        boxShadow: '0 4px 30px rgba(232, 160, 32, 0.08)',
      }}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={proof.audio_url || undefined}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Top: Play button + Photo */}
      <div className="flex items-center justify-between mb-4">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          className="flex items-center justify-center shrink-0"
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: isPlaying
              ? 'rgba(232,160,32,0.15)'
              : 'var(--neram-gold)',
            border: isPlaying
              ? '2px solid var(--neram-gold)'
              : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
          }}
        >
          {isPlaying ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="var(--neram-gold)"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#060d1f"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Parent Photo */}
        {proof.parent_photo ? (
          <img
            src={proof.parent_photo}
            alt={proof.speaker_name}
            className="rounded-full object-cover shrink-0"
            style={{
              width: 64,
              height: 64,
              border: '2px solid var(--neram-gold)',
            }}
            loading="lazy"
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 64,
              height: 64,
              border: '2px solid var(--neram-gold)',
              background: 'var(--neram-card-elevated)',
              color: 'var(--neram-gold)',
              fontSize: '1.5rem',
              fontWeight: 700,
            }}
          >
            {proof.speaker_name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Speaker Info */}
      <div className="mb-3">
        <p
          className="font-bold text-base mb-0.5"
          style={{ color: 'var(--neram-text)', lineHeight: 1.3 }}
        >
          {proof.speaker_name}
        </p>
        {proof.student_name && (
          <p
            className="text-sm"
            style={{ color: 'var(--neram-text-muted)', lineHeight: 1.3 }}
          >
            {proof.student_name}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {proof.batch && (
            <span
              className="text-xs"
              style={{ color: 'var(--neram-text-muted)' }}
            >
              {proof.batch}
            </span>
          )}
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
            style={{
              color: getLanguageColor(proof.language),
              background: `${getLanguageColor(proof.language)}1A`,
              border: `1px solid ${getLanguageColor(proof.language)}33`,
            }}
          >
            {proof.language}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="cursor-pointer"
        onClick={handleProgressClick}
        role="progressbar"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ minHeight: 28, paddingTop: 4 }}
      >
        <div
          className="rounded-full overflow-hidden"
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.1)',
          }}
        >
          <motion.div
            className="rounded-full"
            style={{
              height: '100%',
              background: 'var(--neram-gold)',
            }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>

        {/* Time display */}
        <div
          className="flex justify-between mt-1.5"
          style={{ fontSize: '0.7rem', color: 'var(--neram-text-muted)' }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
