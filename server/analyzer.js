const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Deep Page & Section Analyzer with Exact Element Bounding Coordinates
 */
class PageAnalyzer {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, 'storage');
    this.screenshotsDir = path.join(this.storageDir, 'screenshots');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
    if (!fs.existsSync(this.screenshotsDir)) fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  async analyzePage(pageUrl, browser, options = {}) {
    const {
      viewport = { width: 1440, height: 900 },
      pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      onProgress = () => { }
    } = options;

    const page = await browser.newPage();
    await page.setViewport(viewport);

    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    onProgress({
      type: 'analyzer_navigating',
      message: `Analyzing DOM & Visual Layout for ${pageUrl}...`,
      url: pageUrl
    });

    const startTime = Date.now();
    let responseStatus = 200;
    try {
      const resp = await page.goto(pageUrl, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: 25000
      });
      if (resp) responseStatus = resp.status();
    } catch (e) {
      try {
        const resp2 = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (resp2) responseStatus = resp2.status();
      } catch (err2) {
        await page.close().catch(() => { });
        const errorMsg = err2.message || '';
        if (errorMsg.includes('ERR_CONNECTION_REFUSED')) {
          throw new Error(`Connection Refused on ${pageUrl}. Please make sure your local dev server is running (e.g. "npm run dev") on that port.`);
        } else if (errorMsg.includes('ERR_NAME_NOT_RESOLVED')) {
          throw new Error(`Domain not found for ${pageUrl}. Please verify the website URL.`);
        } else if (errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
          throw new Error(`Connection timed out while trying to reach ${pageUrl}.`);
        } else {
          throw new Error(`Failed to load ${pageUrl}: ${errorMsg}`);
        }
      }
    }

    // Check if Chrome loaded an internal error page
    const currentUrl = page.url();
    if (currentUrl.startsWith('chrome-error://') || currentUrl === 'about:blank') {
      await page.close().catch(() => { });
      throw new Error(`Connection Refused on ${pageUrl}. Please verify your local dev server is running.`);
    }

    const loadTimeMs = Date.now() - startTime;
    await new Promise(r => setTimeout(r, 2000));

    // Auto-scroll the page to trigger scroll-intersection events (lazy images, animations, counters)
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 120;
          const timer = setInterval(() => {
            const scrollHeight = document.documentElement.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 25);
        });
      });
      // Wait for any remaining counters to count up fully and settle
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.log('Auto-scroll failed or timed out:', e.message);
    }

    // Verify page content is not a browser error screen
    const isErrorPage = await page.evaluate(() => {
      const text = (document.body ? document.body.innerText : '') || '';
      return text.includes('ERR_CONNECTION_REFUSED') || text.includes('This site can’t be reached') || text.includes("This site can't be reached");
    });

    if (isErrorPage) {
      await page.close().catch(() => { });
      throw new Error(`Connection Refused on ${pageUrl}. The server is not running on this port.`);
    }

    // 1. Capture Full Page Screenshot
    const fullScreenshotFilename = `${pageId}_full.png`;
    const fullScreenshotPath = path.join(this.screenshotsDir, fullScreenshotFilename);
    await page.screenshot({
      path: fullScreenshotPath,
      fullPage: true
    });

    // 2. Extract DOM & Exact Element Coordinates for Every Visual Entity
    const analysisData = await page.evaluate(() => {
      const getRect = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x + window.scrollX),
          y: Math.round(r.y + window.scrollY),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      };

      const getComputedDetails = (el) => {
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          margin: `${style.marginTop} ${style.marginRight} ${style.marginBottom} ${style.marginLeft}`,
          borderRadius: style.borderRadius,
          display: style.display
        };
      };

      // Extract Exact Coordinates for Specific Entity Elements
      const elementCoordinates = {
        branding: null,
        emails: [],
        phones: [],
        prices: [],
        headings: [],
        products: [],
        addresses: []
      };

      // A. Brand / Logo Rect
      const logoEl = document.querySelector('header a.brand, header .logo, header h1, nav .logo, header img, a[href="/"]');
      if (logoEl) {
        elementCoordinates.branding = {
          text: (logoEl.innerText || logoEl.alt || document.title || '').trim(),
          rect: getRect(logoEl)
        };
      }

      // B. Email Elements & Rects
      const allTextNodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        const txt = (node.textContent || '').trim();
        if (txt.length > 2) allTextNodes.push({ node, text: txt });
      }

      allTextNodes.forEach(({ node, text }) => {
        const el = node.parentElement;
        if (!el || el.offsetParent === null) return;

        // Email check
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          const r = getRect(el);
          if (r.width > 10 && r.height > 5) {
            elementCoordinates.emails.push({
              email: emailMatch[0].toLowerCase(),
              rect: r
            });
          }
        }

        // Phone & Contact check (Standard numbers or labeled phone numbers)
        const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{6,13}|(?:call|phone|tel|mobile|helpline|contact|whatsapp)[:\s]*(\+?[\d\s-]{3,15})/i);
        if (phoneMatch) {
          const rawPh = (phoneMatch[1] || phoneMatch[0]).trim();
          const digits = rawPh.replace(/\D/g, '');
          if (digits.length >= 3) {
            const r = getRect(el);
            if (r.width > 5 && r.height > 5) {
              elementCoordinates.phones.push({
                phone: rawPh,
                digits,
                rect: r
              });
            }
          }
        }

        // Price check
        const priceMatch = text.match(/(?:[$€£₹¥]|USD|INR|EUR|GBP|Rs\.?)\s*[\r\n\t]*\s*[0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?/i);
        if (priceMatch) {
          const r = getRect(el);
          if (r.width > 10 && r.height > 5) {
            elementCoordinates.prices.push({
              raw: priceMatch[0].trim(),
              rect: r
            });
          }
        }
      });

      // Also specifically query tel: links and phone-icon buttons (catches buttons like "📞 1234")
      const phoneElements = Array.from(document.querySelectorAll('a[href^="tel:"], button:has([data-lucide*="phone"]), a:has([data-lucide*="phone"]), button:has(svg), [class*="phone"], [class*="call"]'));
      phoneElements.forEach(pel => {
        const text = (pel.innerText || pel.getAttribute('href') || '').replace(/tel:/i, '').trim();
        const digits = text.replace(/\D/g, '');
        if (digits.length >= 3 && digits.length <= 15) {
          const r = getRect(pel);
          if (!elementCoordinates.phones.some(p => p.digits === digits)) {
            elementCoordinates.phones.push({
              phone: text,
              digits,
              rect: r
            });
          }
        }
      });

      // C. Headings & Products Coordinates
      const headingEls = Array.from(document.querySelectorAll('h1, h2, h3, h4, .product-title, .card-title, [class*="product"] h3'));
      headingEls.forEach(h => {
        const r = getRect(h);
        const txt = (h.innerText || '').trim();
        if (r.width > 20 && r.height > 10 && txt.length > 2) {
          elementCoordinates.headings.push({
            tag: h.tagName.toLowerCase(),
            text: txt,
            rect: r
          });
        }
      });

      // D. Address / Location Elements
      const addressEls = Array.from(document.querySelectorAll('address, [class*="address"], [class*="location"], [class*="contact"] p, footer p'));
      addressEls.forEach(addr => {
        const txt = (addr.innerText || '').trim();
        if (txt.length > 15 && (txt.includes('Road') || txt.includes('Street') || txt.includes('Nagar') || txt.includes('Floor') || txt.includes('Plot') || /\d{6}/.test(txt))) {
          elementCoordinates.addresses.push({
            text: txt,
            rect: getRect(addr)
          });
        }
      });

      // Extract Sections
      const candidateSelectors = [
        'header', 'nav', 'main > section', 'section', 'article',
        '[class*="hero"]', '[class*="banner"]', '[class*="feature"]',
        '[class*="pricing"]', '[class*="about"]', '[class*="product"]',
        '[class*="contact"]', 'form', 'footer'
      ];

      const detectedSections = [];
      const seenElements = new Set();

      candidateSelectors.forEach(query => {
        try {
          const els = Array.from(document.querySelectorAll(query));
          els.forEach(el => {
            if (seenElements.has(el)) return;
            const rect = getRect(el);
            if (rect.width > 20 && rect.height > 20) {
              seenElements.add(el);
              const tag = el.tagName.toLowerCase();
              let sectionType = 'Section';
              const idClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();

              if (tag === 'header' || idClass.includes('header')) sectionType = 'Header';
              else if (tag === 'nav' || idClass.includes('nav')) sectionType = 'Navigation';
              else if (idClass.includes('hero')) sectionType = 'Hero Section';
              else if (idClass.includes('product')) sectionType = 'Products Section';
              else if (idClass.includes('about')) sectionType = 'About Section';
              else if (idClass.includes('contact') || tag === 'form') sectionType = 'Contact / Form';
              else if (tag === 'footer' || idClass.includes('footer')) sectionType = 'Footer';

              const secButtons = Array.from(el.querySelectorAll('button, a.btn, [role="button"], input[type="submit"]')).map(btn => ({
                text: (btn.innerText || btn.value || '').trim(),
                href: btn.getAttribute('href') || null
              }));

              const secImages = Array.from(el.querySelectorAll('img')).map(img => ({
                src: img.src || img.getAttribute('data-src') || '',
                alt: img.alt || ''
              }));

              detectedSections.push({
                type: sectionType,
                tagName: tag,
                selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : tag,
                rect,
                styles: getComputedDetails(el),
                headings: Array.from(el.querySelectorAll('h1, h2, h3, h4')).map(h => ({ tag: h.tagName.toLowerCase(), text: (h.innerText || '').trim(), rect: getRect(h) })),
                buttons: secButtons,
                images: secImages,
                fullText: (el.innerText || '').trim(),
                textSnippet: (el.innerText || '').trim().substring(0, 300)
              });
            }
          });
        } catch (e) { }
      });

      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src || img.getAttribute('data-src') || '',
        alt: img.alt || '',
        width: img.width,
        height: img.height,
        isMissingAlt: !img.alt || img.alt.trim() === ''
      }));

      const allLinks = Array.from(document.querySelectorAll('a[href]')).map(a => ({
        href: a.href,
        text: (a.innerText || '').trim(),
        target: a.target || '_self'
      }));

      // Extract color palette
      const colorPalette = (() => {
        const bgColors = {};
        const textColors = {};
        
        const rgbToHex = (rgb) => {
          if (!rgb) return null;
          const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
          if (!match) return rgb;
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);
          const a = match[4] ? parseFloat(match[4]) : 1;
          if (a === 0) return 'transparent';
          const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : hex;
        };

        const allEls = document.querySelectorAll('*');
        allEls.forEach(el => {
          try {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundColor;
            const color = style.color;
            
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
              const hex = rgbToHex(bg);
              if (hex && hex !== 'transparent') {
                bgColors[hex] = (bgColors[hex] || 0) + 1;
              }
            }
            if (color) {
              const hex = rgbToHex(color);
              if (hex && hex !== 'transparent') {
                textColors[hex] = (textColors[hex] || 0) + 1;
              }
            }
          } catch(e) {}
        });
        
        const getTopColors = (colorMap, limit = 6) => {
          return Object.entries(colorMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([color]) => color);
        };
        
        return {
          backgrounds: getTopColors(bgColors),
          texts: getTopColors(textColors)
        };
      })();

      return {
        meta: {
          title: document.title || '',
          description: document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
        },
        headings: elementCoordinates.headings || [],
        sections: detectedSections || [],
        allImages: allImages || [],
        allLinks: allLinks || [],
        elementCoordinates,
        fullPageText: document.body ? (document.body.innerText || '') : '',
        totalDomNodes: document.querySelectorAll('*').length,
        colorPalette
      };
    });

    await page.close().catch(() => { });

    return {
      pageId,
      url: pageUrl,
      status: responseStatus,
      loadTimeMs,
      screenshot: {
        filename: fullScreenshotFilename,
        path: fullScreenshotPath,
        urlPath: `/storage/screenshots/${fullScreenshotFilename}`
      },
      ...analysisData
    };
  }
}

module.exports = PageAnalyzer;
