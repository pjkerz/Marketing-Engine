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
export declare const PROFILE_DEFAULTS: ProfileDefaults;
export declare function applyDefaults(profile: Partial<AffiliateProfile>): AffiliateProfile & ProfileDefaults;
//# sourceMappingURL=profileMapper.d.ts.map