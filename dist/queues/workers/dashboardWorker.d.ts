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
        businessId: string;
        id: string;
        createdAt: Date;
        insightType: string;
        finding: string;
        evidence: import("@prisma/client/runtime/library.js").JsonValue;
        recommendation: string;
        impact: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    }[];
    activeTests: {
        type: string;
        status: string;
        businessId: string;
        name: string;
        id: string;
        createdAt: Date;
        variants: import("@prisma/client/runtime/library.js").JsonValue;
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