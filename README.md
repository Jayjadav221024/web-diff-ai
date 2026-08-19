# WebDiff AI — Intelligent Website Analyzer & Visual Micro-Diff Engine

WebDiff AI is a full-stack, AI-powered website deep analyzer, multi-page crawler, visual pixel diff engine, and automated section-by-section AI prompt generator.

It allows you to enter any **live website** (e.g. `https://example.com`) or **localhost URL** (e.g. `http://localhost:3000`, `http://localhost:5173`), crawl all internal pages, extract micro-level DOM/CSS/text details, compare two websites/snapshots side-by-side, and automatically generate ready-to-use AI prompts for every detected discrepancy.

---

## 🚀 Key Features

1. **Dual Operating Modes**:
   - ⚡ **Side-by-Side Website Diff**: Compare Baseline (Site A, e.g. Production) vs Target (Site B, e.g. Localhost Dev). Detects micro-differences in layout, CSS styles, typography, text copy, buttons, and media.
   - 🔍 **Single Website Deep Audit**: Crawls all internal routes/pages, parses semantic sections, analyzes performance, SEO meta tags, and generates AI improvement recommendations.

2. **Pixel-Level & Micro-Data Diffing**:
   - **Interactive Swipe Diff Slider**: Drag-to-reveal curtain comparing Baseline vs Modified screenshots.
   - **Pixel Diff Heatmap**: Visual mask highlighting exact pixel changes in magenta.
   - **CSS Computed Style Diffing**: Highlights color shifts, font family changes, font size deviations, padding/margin shifts.
   - **Inline Text Diffing**: Color-coded added (`+`) and removed (`-`) words and sentences.

3. **Section-by-Section AI Prompt Generator**:
   - For every detected discrepancy or analyzed section, WebDiff AI creates copy-ready prompts formatted for **ChatGPT, Claude, Cursor, Copilot, or Antigravity**.
   - Includes CSS selector, before/after values, and instructions for code refactoring.
   - Includes a **Master AI Implementation Prompt** for 1-click full-site syncing.

4. **Real-time Live Crawler with SSE**:
   - Streams live crawling logs, page discovery status, and rendering progress directly to the UI.

---

## 🛠 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```

### 3. Open in Browser
Open [http://localhost:5000](http://localhost:5000) in your web browser.

---

## 💻 Tech Stack
- **Backend**: Node.js, Express, Puppeteer (Headless Chromium), Pixelmatch, PNGjs, Cheerio, Diff
- **Frontend**: Modern Vanilla JS & CSS Design System, Glassmorphism, Lucide Icons, Server-Sent Events (SSE)
