const puppeteer = require('puppeteer');
const url = require('url');

/**
 * Intelligent Crawler that discovers all internal pages of a website/localhost.
 */
class WebsiteCrawler {
  constructor(options = {}) {
    this.maxPages = options.maxPages || 10;
    this.maxDepth = options.maxDepth || 3;
    this.timeout = options.timeout || 30000;
    this.onProgress = options.onProgress || (() => {});
    this.visitedUrls = new Set();
    this.pageQueue = [];
  }

  normalizeUrl(rawUrl, baseUrl) {
    try {
      const parsed = new URL(rawUrl, baseUrl);
      parsed.hash = ''; // Remove fragments
      // Normalize trailing slash if not root
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        parsed.pathname = pathname.slice(0, -1);
      }
      return parsed.href;
    } catch (e) {
      return null;
    }
  }

  isInternalUrl(targetUrl, baseOrigin) {
    try {
      const parsedTarget = new URL(targetUrl);
      const parsedBase = new URL(baseOrigin);
      return parsedTarget.origin === parsedBase.origin;
    } catch (e) {
      return false;
    }
  }

  isValidCrawlablePath(pathname) {
    const ignoredExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
      '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.wav',
      '.css', '.js', '.json', '.xml', '.txt', '.woff', '.woff2', '.ttf'
    ];
    const lower = (pathname || '').toLowerCase();
    return !ignoredExtensions.some(ext => lower.endsWith(ext));
  }

  async crawl(startUrl, browser) {
    const parsedStart = new URL(startUrl);
    const baseOrigin = parsedStart.origin;
    
    this.pageQueue.push({ url: startUrl, depth: 0 });
    this.visitedUrls.add(this.normalizeUrl(startUrl, startUrl));
    
    const discoveredPages = [];
    let pageCount = 0;

    this.onProgress({
      type: 'crawler_start',
      message: `Starting deep crawl on ${startUrl} (Max Pages: ${this.maxPages}, Max Depth: ${this.maxDepth})`,
      totalPagesDiscovered: 1
    });

    while (this.pageQueue.length > 0 && pageCount < this.maxPages) {
      const { url: currentUrl, depth } = this.pageQueue.shift();
      pageCount++;

      this.onProgress({
        type: 'crawler_visiting',
        message: `Crawling page ${pageCount}/${this.maxPages}: ${currentUrl}`,
        currentUrl,
        pageIndex: pageCount,
        queueLength: this.pageQueue.length
      });

      let pageInstance;
      try {
        pageInstance = await browser.newPage();
        await pageInstance.setViewport({ width: 1440, height: 900 });
        await pageInstance.setDefaultNavigationTimeout(this.timeout);

        // Track console errors & network status
        const consoleLogs = [];
        pageInstance.on('console', msg => {
          if (msg.type() === 'error' || msg.type() === 'warning') {
            consoleLogs.push({ type: msg.type(), text: msg.text() });
          }
        });

        const response = await pageInstance.goto(currentUrl, {
          waitUntil: ['domcontentloaded', 'networkidle2'],
          timeout: this.timeout
        });

        const status = response ? response.status() : 200;
        const pageTitle = await pageInstance.title().catch(() => 'Untitled Page');

        // Extract all internal links from the page
        const links = await pageInstance.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return anchors.map(a => ({
            href: a.getAttribute('href'),
            text: (a.textContent || '').trim()
          }));
        });

        const internalLinks = [];
        for (const link of links) {
          const normalized = this.normalizeUrl(link.href, currentUrl);
          if (normalized && this.isInternalUrl(normalized, baseOrigin)) {
            const parsedNorm = new URL(normalized);
            if (this.isValidCrawlablePath(parsedNorm.pathname)) {
              internalLinks.push({ url: normalized, text: link.text });
              if (!this.visitedUrls.has(normalized) && depth + 1 <= this.maxDepth) {
                this.visitedUrls.add(normalized);
                this.pageQueue.push({ url: normalized, depth: depth + 1 });
              }
            }
          }
        }

        discoveredPages.push({
          url: currentUrl,
          title: pageTitle,
          status,
          depth,
          internalLinksCount: internalLinks.length,
          consoleLogs
        });

        this.onProgress({
          type: 'crawler_page_found',
          message: `Discovered "${pageTitle}" (${currentUrl}) with ${internalLinks.length} internal links`,
          discoveredPagesCount: discoveredPages.length,
          queueLength: this.pageQueue.length
        });

      } catch (err) {
        discoveredPages.push({
          url: currentUrl,
          title: 'Error loading page',
          status: 500,
          depth,
          error: err.message,
          consoleLogs: []
        });

        this.onProgress({
          type: 'crawler_error',
          message: `Failed to load ${currentUrl}: ${err.message}`,
          url: currentUrl
        });
      } finally {
        if (pageInstance) {
          await pageInstance.close().catch(() => {});
        }
      }
    }

    this.onProgress({
      type: 'crawler_complete',
      message: `Crawl finished. Discovered ${discoveredPages.length} unique pages.`,
      totalPages: discoveredPages.length
    });

    return discoveredPages;
  }
}

module.exports = WebsiteCrawler;
