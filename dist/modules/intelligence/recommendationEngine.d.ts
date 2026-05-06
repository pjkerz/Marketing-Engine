import { IntelligenceContext } from './contextBuilder';
export declare function generateRecommendations(context: IntelligenceContext, businessId: string): Promise<{
    status: string;
    id: string;
    createdAt: Date;
    businessId: string;
    priority: string;
    recommendation: string;
    title: string;
    channels: string[];
    insight: string;
    actions: import("@prisma/client/runtime/library").JsonValue;
    estimatedImpact: string;
    autoExecutable: boolean;
    executedAt: Date | null;
}[]>;
//# sourceMappingURL=recommendationEngine.d.ts.map