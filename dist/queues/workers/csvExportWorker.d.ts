export declare function generatePlatformCSV(businessId: string, platform?: string): Promise<{
    csvText: string;
    platform: string;
    count: number;
}[]>;
export declare function startCsvExportWorker(): void;
export declare function stopCsvExportWorker(): Promise<void>;
//# sourceMappingURL=csvExportWorker.d.ts.map