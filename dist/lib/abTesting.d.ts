import { AbTest } from '@prisma/client';
export declare function assignVariant(sessionId: string, test: AbTest): string;
export declare function trackVariantEvent(testId: string, variantId: string, eventType: 'impression' | 'click' | 'conversion'): Promise<void>;
export declare function getActiveTest(businessId: string, type: string): Promise<AbTest | null>;
//# sourceMappingURL=abTesting.d.ts.map