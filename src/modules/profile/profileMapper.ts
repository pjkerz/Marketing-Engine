import { AffiliateProfile } from '@prisma/client';

export interface ProfileDefaults {
  humor: number;
  ctaStrength: string;
  desiredEmotion: string;
  goal: string;
  format: string;
  voice: string;
  controversy: string;
  platforms: string[];
}

export const PROFILE_DEFAULTS: ProfileDefaults = {
  humor: 0.2,
  ctaStrength: 'soft',
  desiredEmotion: 'curiosity',
  goal: 'signups',
  format: 'framework',
  voice: 'operator',
  controversy: 'balanced',
  platforms: ['linkedin'],
};

export function applyDefaults(profile: Partial<AffiliateProfile>): AffiliateProfile & ProfileDefaults {
  return {
    ...profile,
    humor: (profile as unknown as { humor?: number }).humor ?? PROFILE_DEFAULTS.humor,
    ctaStrength: profile.ctaStrength ?? PROFILE_DEFAULTS.ctaStrength,
    desiredEmotion: profile.desiredEmotion ?? PROFILE_DEFAULTS.desiredEmotion,
    goal: profile.goal ?? PROFILE_DEFAULTS.goal,
    format: profile.format ?? PROFILE_DEFAULTS.format,
    voice: profile.voice ?? PROFILE_DEFAULTS.voice,
    controversy: profile.controversy ?? PROFILE_DEFAULTS.controversy,
    platforms: profile.platforms?.length ? profile.platforms : PROFILE_DEFAULTS.platforms,
  } as AffiliateProfile & ProfileDefaults;
}
