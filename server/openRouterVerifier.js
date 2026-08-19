const fs = require('fs');
const path = require('path');

class OpenRouterVerifier {
  /**
   * Main verification entry point calling OpenRouter
   */
  static async verifyData(analysisA, analysisB, options = {}) {
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API Key is missing. Please provide it in the UI or set OPENROUTER_API_KEY on the server.');
    }

    const model = options.model || 'google/gemini-2.5-flash:free';
    const useVision = !!options.useVision;
    
    // 1. Prepare Compact Payload Data
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

    let messagesContent;

    if (useVision) {
      userPromptText += `\nscreenshots attached. Image 1 is Site A, Image 2 is Site B. Perform visual & text QA audit.`;
      
      const contentArray = [
        {
          type: 'text',
          text: userPromptText
        }
      ];

      try {
        if (analysisA.screenshot && analysisA.screenshot.path && fs.existsSync(analysisA.screenshot.path)) {
          const imgBase64A = fs.readFileSync(analysisA.screenshot.path).toString('base64');
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imgBase64A}`
            }
          });
        }
        if (analysisB.screenshot && analysisB.screenshot.path && fs.existsSync(analysisB.screenshot.path)) {
          const imgBase64B = fs.readFileSync(analysisB.screenshot.path).toString('base64');
          contentArray.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imgBase64B}`
            }
          });
        }
      } catch (err) {
        console.error('Failed to load screenshots for OpenRouter Vision:', err);
      }

      messagesContent = contentArray;
    } else {
      messagesContent = userPromptText;
    }

    // 2. Define standard system prompt instructing concise JSON output
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

    // 3. Make HTTP request to OpenRouter Chat Completions endpoint (limited max_tokens to 1500)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5000',
          'X-OpenRouter-Title': 'WebDiff AI'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 1500,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: messagesContent
            }
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('OpenRouter API Timeout: The request took too long (>25s) to respond. Please check model availability or try again.');
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
      throw new Error(`OpenRouter API Error: ${errMsg}`);
    }

    const data = await response.json();
    
    // Log token usage metrics
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (inputTokens + outputTokens);
    console.log(`[OpenRouter Usage Log] Model: ${model} | Input Tokens: ${inputTokens} | Output Tokens: ${outputTokens} | Total Tokens: ${totalTokens}`);

    let text = data.choices?.[0]?.message?.content || '';

    // 4. Parse Output
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
      console.error('OpenRouter raw response was:', text);
      throw new Error('Failed to parse OpenRouter output as valid JSON. Raw response: ' + text.substring(0, 500));
    }
  }
}

module.exports = OpenRouterVerifier;
