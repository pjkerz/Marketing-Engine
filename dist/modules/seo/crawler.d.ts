export interface PageContent {
    url: string;
    title: string;
    metaDescription: string;
    h1: string[];
    h2: string[];
    h3: string[];
    bodyText: string;
    links: string[];
    imageAlts: string[];
}
export interface CrawlResult {
    rootUrl: string;
    pages: PageContent[];
    crawledAt: Date;
}
export declare function crawlUrl(rootUrl: string, maxPages?: number): Promise<PageContent[]>;
//# sourceMappingURL=crawler.d.ts.map