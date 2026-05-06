import { Queue } from 'bullmq';
export declare let dashboardQueue: Queue | null;
export declare function computeDashboardData(businessId: string, days?: number): Promise<{
    funnelSummary: Record<string, {
        count: number;
        change: number;
    }>;
    overallCvr: number;
    channelPerformance: {
        channel: string;
        clicks: number;
        conversions: number;
        cvr: number;
    }[];
    affiliateLeaderboard: {
        affiliateCode: string;
        name: string;
        clicks: number;
        conversions: number;
        cvr: number;
    }[];
    topContent: {
        contentRunId: string;
        channel: string;
        preview: string;
        clicks: number;
    }[];
    insights: {
        status: string;
        id: string;
        createdAt: Date;
        businessId: string;
        insightType: string;
        finding: string;
        evidence: import("@prisma/client/runtime/library").JsonValue;
        recommendation: string;
        impact: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    }[];
    activeTests: {
        type: string;
        status: string;
        id: string;
        name: string;
        createdAt: Date;
        businessId: string;
        variants: import("@prisma/client/runtime/library").JsonValue;
        winnerVariantId: string | null;
        startedAt: Date;
        endedAt: Date | null;
    }[];
    generatedAt: string;
    days: number;
}>;
export declare function detectAnomalies(businessId: string, context: Awaited<ReturnType<typeof computeDashboardData>>): Promise<void>;
export declare function startDashboardWorker(): void;
export declare function stopDashboardWorker(): void;
//# sourceMappingURL=dashboardWorker.d.ts.map