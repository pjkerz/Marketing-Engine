import { AffiliateProfile } from '@prisma/client';
export declare function getOptimisationRules(businessId: string): Promise<{
    businessId: string;
    id: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    ruleType: string;
    config: import("@prisma/client/runtime/library").JsonValue;
    createdFrom: string | null;
}[]>;
export declare function weightedRandom(weights: Record<string, number>): string;
export declare function applyOptimisationToGeneration(businessId: string, opts: {
    channel: string;
}): Promise<{
    preferredFormat?: string;
    preferredTime?: string;
}>;
export interface PersonalizationInput {
    baseContent: string;
    channel: string;
    affiliateCode: string;
    profile: AffiliateProfile;
}
export declare function personalize(input: PersonalizationInput): string;
//# sourceMappingURL=personalizationEngine.d.ts.map