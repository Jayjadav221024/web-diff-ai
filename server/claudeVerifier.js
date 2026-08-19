const fs = require('fs');
const path = require('path');

class ClaudeVerifier {
  /**
   * Main verification entry point calling Claude 3.5 Sonnet
   */
  static async verifyData(analysisA, analysisB, options = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API Key is missing. Please provide it in the UI or set ANTHROPIC_API_KEY on the server.');
    }

    const useVision = !!options.useVision;
    
    // 1. Prepare Compact Content Blocks
    const contentBlocks = [];

    // Strip styles and limit image/text arrays to minimize token usage
    const siteADetails = {
      url: analysisA.url,
      title: analysisA.meta?.title || '',
      description: analysisA.meta?.description || '',
      headings: (analysisA.headings || []).map(h => ({ tag: h.tag, text: h.text })),
      sections: (analysisA.sections || []).map(s => ({
        type: s.type,
        selector: s.selector,
        textSnippet: s.textSnippet,
        headings: s.headings ? s.headings.map(sh => sh.text) : [],
        buttons: s.buttons ? s.buttons.map(b => b.text) : []
      })),
      allImages: (analysisA.allImages || []).slice(0, 10).map(img => ({ src: path.basename(img.src || ''), alt: img.alt || '' })),
      fullPageTextSnippet: (analysisA.fullPageText || '').substring(0, 6000)
    };

    const siteBDetails = {
      url: analysisB.url,
      title: analysisB.meta?.title || '',
      description: analysisB.meta?.description || '',
      headings: (analysisB.headings || []).map(h => ({ tag: h.tag, text: h.text })),
      sections: (analysisB.sections || []).map(s => ({
        type: s.type,
        selector: s.selector,
        textSnippet: s.textSnippet,
        headings: s.headings ? s.headings.map(sh => sh.text) : [],
        buttons: s.buttons ? s.buttons.map(b => b.text) : []
      })),
      allImages: (analysisB.allImages || []).slice(0, 10).map(img => ({ src: path.basename(img.src || ''), alt: img.alt || '' })),
      fullPageTextSnippet: (analysisB.fullPageText || '').substring(0, 6000)
    };

    // Compact prompt text
    let userPromptText = `Compare Reference Site A and Localhost Site B.
Site A: ${analysisA.url}
Site B: ${analysisB.url}

=== SITE A ===
${JSON.stringify(siteADetails)}

=== SITE B ===
${JSON.stringify(siteBDetails)}`;

    if (useVision) {
      userPromptText += `\nscreenshots attached. Image 1 is Site A, Image 2 is Site B. Perform visual & text QA audit.`;
    }

    contentBlocks.push({
      type: 'text',
      text: userPromptText
    });

    // 2. Add screenshots if vision is requested and images exist
    if (useVision) {
      try {
        if (analysisA.screenshot && analysisA.screenshot.path && fs.existsSync(analysisA.screenshot.path)) {
          const imgBase64A = fs.readFileSync(analysisA.screenshot.path).toString('base64');
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imgBase64A
            }
          });
        }
        if (analysisB.screenshot && analysisB.screenshot.path && fs.existsSync(analysisB.screenshot.path)) {
          const imgBase64B = fs.readFileSync(analysisB.screenshot.path).toString('base64');
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imgBase64B
            }
          });
        }
      } catch (err) {
        console.error('Failed to load screenshots for Claude Vision:', err);
      }
    }

    // 3. Define the concise JSON schema in system prompt
    const systemPrompt = `You are a Web QA Verification Engine. Compare Site A (Reference) and Site B (Localhost).
    
    RULES:
    1. STRICTLY IGNORE COPY/HEADING REWORDINGS & COPY CHANGES: Do NOT flag semantic text phrasing changes or title adjustments (e.g., "What our clients say" vs "Our Testimonials", or "Operational Domains" vs "Our Domains") as errors. These are normal styling/copy updates during a website revamp.
    2. ONLY FLAG FACTUAL CONFLICTS & FAKE DATA: Only flag actual incorrect data or statistics. Examples:
       - Discrepant stats (e.g., reference says "60+ years experience" or "5 years" but localhost says "0+" or "70 years").
       - Discrepant contact details (e.g. wrong phone, wrong email, wrong location).
       - Conflicting names, pricing, or factual specs.
    3. Visual Bugs (only if screenshots are provided): Check layout alignment, visual style, or overlapping text.
    
    Return ONLY a JSON object:
    {
      "mismatches": [
        {
          "category": "Contact Info" | "Pricing" | "Headings" | "Typography" | "Branding" | "Layout Alignment" | "Visual Style",
          "field": "Discrepancy field/element",
          "expectedValue": "The raw correct value from Site A (do NOT append ' (Site A)' or any suffix)",
          "localhostValue": "The raw wrong value from Site B (do NOT append ' (Site B)' or any suffix)",
          "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
          "section": "Page section",
          "rect": { "x": 0, "y": 0, "width": 0, "height": 0 },
          "description": "Short explanation"
        }
      ],
      "aiPrompts": {
        "sectionPrompts": [
          {
            "sectionIndex": 1,
            "sectionName": "Section Name",
            "title": "Fix [Section Name]",
            "prompt": "Markdown instructions to fix only this component data/style in code.",
            "totalErrors": 1
          }
        ],
        "masterDataPrompt": "Unified prompt to fix all data issues in code. Keep UI styles untouched.",
        "masterUiPrompt": "Unified prompt to fix visual/layout bugs. Otherwise empty."
      }
    }
    
    IMPORTANT:
    - Return exact text strings without adding ' (Site A)' or ' (Site B)' label markers.
    - Output must be parseable JSON only. Do not wrap in markdown or prefix/suffix with explanations.`;

    // 4. API Request to Anthropic with constrained max_tokens (1500 instead of 4096)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 3500,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: contentBlocks
            }
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('Anthropic Claude API Timeout: The request took too long (>25s) to respond. Please try again.');
      }
      throw e;
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      const errMsg = errorJson?.error?.message || errorText || response.statusText;
      throw new Error(`Anthropic Claude API Error: ${errMsg}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Anthropic Claude API Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    if (!data.content || data.content.length === 0) {
      throw new Error(`Anthropic Claude API Error: No content returned. Response: ${JSON.stringify(data)}`);
    }
    
    // Log token usage metrics
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = (inputTokens * 3 / 1000000) + (outputTokens * 15 / 1000000); // Claude 3.5 pricing ($3M / $15M input/output Mtokens)
    console.log(`[Claude Usage Log] Model: claude-3-5-sonnet | Input Tokens: ${inputTokens} | Output Tokens: ${outputTokens} | Total Tokens: ${totalTokens} | Est. Cost: $${estimatedCost.toFixed(5)}`);

    let text = data.content?.[0]?.text || '';

    // 5. Parse Output
    text = text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(text.trim());
      parsed.totalMismatches = parsed.mismatches ? parsed.mismatches.length : 0;
      parsed.isDataAccurate = parsed.totalMismatches === 0;
      
      if (parsed.aiPrompts) {
        parsed.aiPrompts.totalErrors = parsed.totalMismatches;
        parsed.aiPrompts.totalPrompts = parsed.aiPrompts.sectionPrompts ? parsed.aiPrompts.sectionPrompts.length : 0;
      }

      return parsed;
    } catch (parseErr) {
      console.error('Claude raw response was:', text);
      throw new Error('Failed to parse Claude analysis output as valid JSON. Raw response: ' + text.substring(0, 500));
    }
  }
}

module.exports = ClaudeVerifier;
