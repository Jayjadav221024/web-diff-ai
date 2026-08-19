process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load environment variables from local .env file if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.log('No .env file found or failed to parse, using system env.');
}
const puppeteer = require('puppeteer');

const WebsiteCrawler = require('./crawler');
const PageAnalyzer = require('./analyzer');
const DiffEngine = require('./diffEngine');
const PromptGenerator = require('./promptGenerator');
const DataVerifier = require('./dataVerifier');
const ClaudeVerifier = require('./claudeVerifier');
const OpenRouterVerifier = require('./openRouterVerifier');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Storage directory for screenshots, diffs, and exported reports
const storageDir = path.join(__dirname, 'storage');
const screenshotsDir = path.join(storageDir, 'screenshots');
const diffsDir = path.join(storageDir, 'diffs');
const reportsDir = path.join(storageDir, 'reports');

[storageDir, screenshotsDir, diffsDir, reportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve static storage files & frontend client
app.use('/storage', express.static(storageDir));
app.use(express.static(path.join(__dirname, '..', 'client')));

// In-memory progress tracking for Server-Sent Events (SSE)
const jobProgress = new Map();
const clients = new Map(); // jobId -> [res]

function broadcastProgress(jobId, data) {
  const current = jobProgress.get(jobId) || [];
  current.push(data);
  jobProgress.set(jobId, current);

  const listeners = clients.get(jobId) || [];
  listeners.forEach(res => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
  });
}

// SSE Progress Endpoint
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevents Render/NGINX proxy buffering
  res.flushHeaders();

  // Send immediate comment ping
  res.write(': ping\n\n');

  // Send historical messages if any
  const history = jobProgress.get(jobId) || [];
  history.forEach(item => {
    res.write(`data: ${JSON.stringify(item)}\n\n`);
  });

  if (!clients.has(jobId)) {
    clients.set(jobId, []);
  }
  clients.get(jobId).push(res);

  req.on('close', () => {
    const list = clients.get(jobId) || [];
    clients.set(jobId, list.filter(c => c !== res));
  });
});

// Polling fallback endpoint for cloud environments
app.get('/api/progress-poll/:jobId', (req, res) => {
  const { jobId } = req.params;
  const history = jobProgress.get(jobId) || [];
  res.json({ history });
});

let sharedBrowser = null;
async function getBrowser() {
  if (!sharedBrowser || !sharedBrowser.connected) {
    sharedBrowser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--ignore-certificate-errors'
      ]
    });
  }
  return sharedBrowser;
}

/**
 * Endpoint: Deep Single Website Audit & Page Explorer
 */
app.post('/api/analyze', async (req, res) => {
  const { url, maxPages = 5, maxDepth = 2, viewport = { width: 1440, height: 900 } } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Please provide a valid website or localhost URL.' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.json({ jobId, message: 'Analysis started. Subscribe to /api/progress/' + jobId });

  (async () => {
    let browser;
    try {
      browser = await getBrowser();

      broadcastProgress(jobId, {
        type: 'start',
        message: `Connecting to ${url}...`,
        progress: 10
      });

      // 1. Crawl internal pages
      const crawler = new WebsiteCrawler({
        maxPages: parseInt(maxPages, 10),
        maxDepth: parseInt(maxDepth, 10),
        onProgress: (prog) => broadcastProgress(jobId, { ...prog, progress: 30 })
      });

      const discoveredPages = await crawler.crawl(url, browser);

      broadcastProgress(jobId, {
        type: 'crawler_done',
        message: `Discovered ${discoveredPages.length} internal pages. Analyzing DOM & content...`,
        progress: 50
      });

      // 2. Analyze primary page
      const analyzer = new PageAnalyzer({ storageDir });
      const mainAnalysis = await analyzer.analyzePage(url, browser, {
        viewport,
        onProgress: (prog) => broadcastProgress(jobId, { ...prog, progress: 75 })
      });

      // 3. Generate AI prompts
      const aiPrompts = PromptGenerator.generateAuditPrompts(mainAnalysis);

      const result = {
        jobId,
        url,
        timestamp: new Date().toISOString(),
        discoveredPages,
        mainAnalysis,
        aiPrompts,
        success: true
      };

      const reportFile = path.join(reportsDir, `${jobId}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(result, null, 2));

      broadcastProgress(jobId, {
        type: 'completed',
        message: `Website Analysis Successfully Completed for ${url}!`,
        result,
        progress: 100
      });

    } catch (err) {
      console.error('Audit Error:', err);
      broadcastProgress(jobId, {
        type: 'error',
        message: `Analysis error: ${err.message}`,
        progress: 100
      });
    }
  })();
});

/**
 * Endpoint: Side-by-Side Website & Data Verification
 */
app.post('/api/compare', async (req, res) => {
  const {
    urlA,
    urlB,
    mode = 'compare', // 'compare' (full UI + Data) or 'data-only' (Strict Data & Content verification)
    viewport = { width: 1440, height: 900 },
    useClaude = false,
    useVision = false,
    apiKey = '',
    aiProvider = 'claude',
    openRouterModel = 'openrouter/free'
  } = req.body;

  if (!urlA || !urlB) {
    return res.status(400).json({ error: 'Please provide both Reference (Site A) and Localhost (Site B) URLs.' });
  }

  const jobId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.json({ jobId, message: 'Verification started. Subscribe to /api/progress/' + jobId });

  (async () => {
    let browser;
    try {
      browser = await getBrowser();

      broadcastProgress(jobId, {
        type: 'start',
        message: `Starting verification: Reference (${urlA}) vs Localhost (${urlB})...`,
        progress: 10
      });

      const analyzer = new PageAnalyzer({ storageDir });

      // 1. Discover page pairs to compare (crawls subpages if compareAllPages is selected)
      let pagePairs = [{ urlA, urlB }];

      if (req.body.compareAllPages) {
        broadcastProgress(jobId, {
          type: 'crawler_start',
          message: `Crawling Reference Site ${urlA} to discover subpages (Max 5)...`,
          progress: 12
        });
        const crawler = new WebsiteCrawler({
          maxPages: 5,
          maxDepth: 2
        });
        try {
          const discovered = await crawler.crawl(urlA, browser);
          const originA = new URL(urlA).origin;
          const originB = new URL(urlB).origin;
          discovered.forEach(page => {
            if (page.url !== urlA && page.status === 200) {
              const mappedUrlB = page.url.replace(originA, originB);
              pagePairs.push({ urlA: page.url, urlB: mappedUrlB });
            }
          });
          broadcastProgress(jobId, {
            type: 'crawler_done',
            message: `Discovered ${pagePairs.length} pages to compare. Starting analyses...`,
            progress: 20
          });
        } catch (e) {
          console.error('Crawler failed, falling back to home page only.', e);
        }
      }

      let aggregatedMismatches = [];
      let aggregatedSectionPrompts = [];
      const masterDataPromptsList = [];
      const masterUiPromptsList = [];
      const combinedColorPaletteA = { backgrounds: [], texts: [] };
      const combinedColorPaletteB = { backgrounds: [], texts: [] };
      
      let analysisA = null;
      let analysisB = null;

      for (let i = 0; i < pagePairs.length; i++) {
        const pair = pagePairs[i];
        const pageIdx = i + 1;
        const total = pagePairs.length;
        const relativePath = new URL(pair.urlA).pathname;

        broadcastProgress(jobId, {
          type: 'analyzing_pair',
          message: `[Page ${pageIdx}/${total}] Scraping "${relativePath}" on Site A & Site B...`,
          progress: Math.round(20 + (i / total) * 50)
        });

        const pageAnalysisA = await analyzer.analyzePage(pair.urlA, browser, {
          viewport,
          pageId: `${jobId}_siteA_${i}`
        });

        const pageAnalysisB = await analyzer.analyzePage(pair.urlB, browser, {
          viewport,
          pageId: `${jobId}_siteB_${i}`
        });

        if (i === 0) {
          analysisA = pageAnalysisA;
          analysisB = pageAnalysisB;
        }

        // Merge color palettes
        if (pageAnalysisA.colorPalette?.backgrounds) {
          combinedColorPaletteA.backgrounds = [...new Set([...combinedColorPaletteA.backgrounds, ...pageAnalysisA.colorPalette.backgrounds])];
        }
        if (pageAnalysisA.colorPalette?.texts) {
          combinedColorPaletteA.texts = [...new Set([...combinedColorPaletteA.texts, ...pageAnalysisA.colorPalette.texts])];
        }
        if (pageAnalysisB.colorPalette?.backgrounds) {
          combinedColorPaletteB.backgrounds = [...new Set([...combinedColorPaletteB.backgrounds, ...pageAnalysisB.colorPalette.backgrounds])];
        }
        if (pageAnalysisB.colorPalette?.texts) {
          combinedColorPaletteB.texts = [...new Set([...combinedColorPaletteB.texts, ...pageAnalysisB.colorPalette.texts])];
        }

        // Compare data for this page pair
        let pageMismatches = [];
        let pageDataFixPrompts = null;

        // Check cache & identical checking for this pair
        const crypto = require('crypto');
        const inputHash = crypto.createHash('sha256').update(JSON.stringify({
          urlA: pair.urlA,
          urlB: pair.urlB,
          useClaude,
          useVision,
          aiProvider,
          openRouterModel,
          textA: pageAnalysisA.fullPageText || '',
          textB: pageAnalysisB.fullPageText || ''
        })).digest('hex');

        const textA = (pageAnalysisA.fullPageText || '').trim();
        const textB = (pageAnalysisB.fullPageText || '').trim();
        const isTextIdentical = textA.length > 50 && textB.length > 50 && textA === textB;
        
        if (!global.aiCache) {
          global.aiCache = new Map();
        }
        const cachedResult = global.aiCache.get(inputHash);

        if (useClaude && isTextIdentical && !useVision) {
          console.log(`⚡ [AI Optimization] Short-circuiting ${relativePath}: Scraped text matches perfectly.`);
          pageMismatches = [];
          pageDataFixPrompts = { sectionPrompts: [], masterDataPrompt: 'No changes required.', masterUiPrompt: '' };
        } else if (useClaude && cachedResult) {
          console.log(`⚡ [AI Optimization] Cache hit for ${relativePath}!`);
          pageMismatches = cachedResult.dataVerification?.mismatches || [];
          pageDataFixPrompts = cachedResult.dataFixPrompts;
        } else if (useClaude) {
          if (aiProvider === 'openrouter') {
            const aiResult = await OpenRouterVerifier.verifyData(pageAnalysisA, pageAnalysisB, {
              apiKey,
              useVision,
              model: openRouterModel
            });
            pageMismatches = aiResult.mismatches || [];
            pageDataFixPrompts = aiResult.aiPrompts;
          } else {
            const claudeResult = await ClaudeVerifier.verifyData(pageAnalysisA, pageAnalysisB, {
              apiKey,
              useVision
            });
            pageMismatches = claudeResult.mismatches || [];
            pageDataFixPrompts = claudeResult.aiPrompts;
          }

          // Save to cache
          global.aiCache.set(inputHash, {
            dataVerification: { mismatches: pageMismatches },
            dataFixPrompts: pageDataFixPrompts,
            aiPrompts: pageDataFixPrompts
          });
        } else {
          const verifyRes = DataVerifier.verifyData(pageAnalysisA, pageAnalysisB);
          pageMismatches = verifyRes.mismatches || [];
          pageDataFixPrompts = DataVerifier.generateDataFixPrompts(verifyRes, pair.urlB, pair.urlA);
        }

        // Prefix mismatches with page relative path to make it clear!
        pageMismatches.forEach(m => {
          m.section = `[Page: ${relativePath}] ${m.section || 'General'}`;
          aggregatedMismatches.push(m);
        });

        if (pageDataFixPrompts?.sectionPrompts) {
          pageDataFixPrompts.sectionPrompts.forEach(sp => {
            sp.sectionName = `[Page: ${relativePath}] ${sp.sectionName}`;
            aggregatedSectionPrompts.push(sp);
          });
        }

        if (pageDataFixPrompts?.masterDataPrompt) {
          masterDataPromptsList.push(`### Page: ${relativePath}\n${pageDataFixPrompts.masterDataPrompt}`);
        }
        if (pageDataFixPrompts?.masterUiPrompt) {
          masterUiPromptsList.push(`### Page: ${relativePath}\n${pageDataFixPrompts.masterUiPrompt}`);
        }
      }

      // Consolidate aggregated results
      dataVerification = {
        totalMismatches: aggregatedMismatches.length,
        mismatches: aggregatedMismatches,
        isDataAccurate: aggregatedMismatches.length === 0,
        timestamp: new Date().toISOString(),
        colorPaletteA: combinedColorPaletteA,
        colorPaletteB: combinedColorPaletteB
      };

      dataFixPrompts = {
        sectionPrompts: aggregatedSectionPrompts,
        masterDataPrompt: masterDataPromptsList.join('\n\n'),
        masterUiPrompt: masterUiPromptsList.join('\n\n'),
        totalPrompts: aggregatedSectionPrompts.length,
        totalErrors: aggregatedMismatches.length
      };

      aiPrompts = {
        sectionPrompts: aggregatedSectionPrompts,
        masterPrompt: masterDataPromptsList.join('\n\n'),
        totalPrompts: aggregatedSectionPrompts.length
      };

      // 2. Run Visual & DOM Diff Engine (to support visual overlay comparisons)
      broadcastProgress(jobId, {
        type: 'diffing',
        message: `Generating visual comparison and micro-diffs...`,
        progress: 85
      });
      const diffEngine = new DiffEngine({ storageDir });
      const diffResult = await diffEngine.comparePageAnalyses(analysisA, analysisB, jobId);

      // 3. Generate UI Diff Prompts if not using Claude (or merge them)
      if (!useClaude) {
        aiPrompts = PromptGenerator.generateDiffPrompts(diffResult, analysisA, analysisB);
      }

      const fullResult = {
        jobId,
        mode,
        timestamp: new Date().toISOString(),
        urlA,
        urlB,
        analysisA,
        analysisB,
        diffResult,
        aiPrompts,
        dataVerification,
        dataFixPrompts,
        isClaudeUsed: useClaude,
        aiProvider: useClaude ? aiProvider : null,
        openRouterModel: useClaude && aiProvider === 'openrouter' ? openRouterModel : null,
        success: true
      };

      const reportFile = path.join(reportsDir, `${jobId}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(fullResult, null, 2));

      broadcastProgress(jobId, {
        type: 'completed',
        message: `Data Verification Complete! Found ${dataVerification.totalMismatches} mismatches.`,
        result: fullResult,
        progress: 100
      });

    } catch (err) {
      console.error('Comparison Error:', err);
      broadcastProgress(jobId, {
        type: 'error',
        message: `Verification error: ${err.message}`,
        progress: 100
      });
    }
  })();
});

/**
 * Export full report as Markdown or JSON
 */
app.get('/api/reports/:id/export', (req, res) => {
  const { id } = req.params;
  const format = (req.query.format || 'json').toLowerCase();
  const reportPath = path.join(reportsDir, `${id}.json`);

  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const rawData = fs.readFileSync(reportPath, 'utf8');
  const report = JSON.parse(rawData);

  if (format === 'markdown' || format === 'md') {
    let md = `# WebDiff AI Data & Website Verification Report\n\n`;
    md += `**Date**: ${report.timestamp}\n`;
    if (report.urlA && report.urlB) {
      md += `**Verified Reference**: ${report.urlA}\n`;
      md += `**Localhost Target**: ${report.urlB}\n`;
      md += `**Data Mismatches Found**: ${report.dataVerification?.totalMismatches || 0}\n\n`;

      if (report.dataFixPrompts?.masterDataPrompt) {
        md += `## 🤖 Master Data Correction AI Prompt (NO UI/CSS Changes)\n\n\`\`\`markdown\n${report.dataFixPrompts.masterDataPrompt}\n\`\`\`\n\n`;
      }
    }

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="webdiff-report-${id}.md"`);
    return res.send(md);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="webdiff-report-${id}.json"`);
  res.json(report);
});

// Fallback route to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 WebDiff AI Server is running on http://localhost:${PORT}`);
  console.log(`⚡ Ready to verify data & analyze websites`);
  console.log(`======================================================\n`);
});
