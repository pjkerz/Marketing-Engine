import { IntelligenceContext } from './contextBuilder.js';
export declare function generateRecommendations(context: IntelligenceContext, businessId: string): Promise<{
    status: string;
    businessId: string;
    priority: string;
    id: string;
    createdAt: Date;
    recommendation: string;
    title: string;
    channels: string[];
    insight: string;
    actions: import("@prisma/client/runtime/library.js").JsonValue;
    estimatedImpact: string;
    autoExecutable: boolean;
    executedAt: Date | null;
}[]>;
//# sourceMappingURL=recommendationEngine.d.ts.map