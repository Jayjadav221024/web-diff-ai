/**
 * Precision Conflict-Only Business Data Verifier
 * 
 * CORE PRINCIPLE:
 * - Allows & respects newly added revamp data, extra products, new FAQ/features in localhost.
 * - ONLY flags EXPLICIT FACTUAL CONTRADICTIONS & WRONG VALUES (e.g., Wrong Phone, Wrong Email,
 *   Wrong Company Name, Conflicting Experience Years, Wrong Prices, Wrong GST/Address).
 * - Zero false alarms on newly added content or revamped UI sections.
 */
class DataVerifier {
  static cleanText(str) {
    if (!str) return '';
    return str.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  static getAllText(analysis) {
    if (analysis.fullPageText && analysis.fullPageText.length > 50) {
      return analysis.fullPageText;
    }
    const textPieces = [];
    if (analysis.sections) {
      analysis.sections.forEach(s => {
        if (s.fullText) textPieces.push(s.fullText);
        else if (s.textSnippet) textPieces.push(s.textSnippet);
      });
    }
    if (analysis.headings) {
      analysis.headings.forEach(h => {
        if (h.text) textPieces.push(h.text);
      });
    }
    return textPieces.join('\n\n');
  }

  /**
   * Parses price with currency normalization
   */
  static parsePrice(rawStr) {
    if (!rawStr) return null;
    const clean = this.cleanText(rawStr);
    let currency = 'INR';
    if (clean.includes('$') || clean.toUpperCase().includes('USD')) currency = 'USD';
    else if (clean.includes('€') || clean.toUpperCase().includes('EUR')) currency = 'EUR';
    else if (clean.includes('£') || clean.toUpperCase().includes('GBP')) currency = 'GBP';

    const numMatch = clean.match(/[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?/);
    if (!numMatch) return null;
    const amount = parseFloat(numMatch[0].replace(/,/g, ''));
    return { amount, currency, raw: clean };
  }

  /**
   * Extracts clean structured factual entities from a page
   */
  static extractFactualEntities(analysis) {
    const fullText = this.getAllText(analysis);
    const cleanedText = this.cleanText(fullText);
    const coords = analysis.elementCoordinates || { branding: null, emails: [], phones: [], prices: [], headings: [], addresses: [] };

    // 1. Company / Brand Identity
    let companyName = '';
    const titleMatch = (analysis.meta?.title || '').split(/[-|–•:,]/)[0].trim();
    if (titleMatch && titleMatch.length > 2 && titleMatch.length < 50 && !titleMatch.toLowerCase().includes('home')) {
      companyName = titleMatch;
    } else if (coords.branding?.text && coords.branding.text.length > 2) {
      companyName = coords.branding.text;
    } else if (analysis.headings && analysis.headings.length > 0) {
      companyName = analysis.headings[0].text.trim();
    }

    // 2. Official Emails
    const emails = [];
    const emailMatches = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emailMatches.forEach(em => {
      const clean = em.toLowerCase().trim();
      if (!clean.includes('w3.org') && !clean.includes('schema.org') && !emails.includes(clean)) {
        emails.push(clean);
      }
    });

    // 3. Official Contact Phones (Including icon-adjacent buttons & labeled numbers)
    const phones = [];
    (coords.phones || []).forEach(item => {
      const raw = item.raw || item.phone || item.text || item.digits || '';
      if (raw && !phones.some(p => p.digits === item.digits)) {
        phones.push({ raw, phone: raw, digits: item.digits, rect: item.rect });
      }
    });

    const phoneMatches = fullText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{6,13}|(?:call|phone|tel|mobile|helpline|contact|whatsapp)[:\s]*(\+?[\d\s-]{3,15})/gi) || [];
    phoneMatches.forEach(ph => {
      const rawClean = this.cleanText(ph).replace(/(?:call|phone|tel|mobile|helpline|contact|whatsapp)[:\s]*/i, '');
      const digits = rawClean.replace(/\D/g, '');
      if (digits.length >= 3 && digits.length <= 15) {
        if (!phones.some(p => p.digits === digits)) {
          phones.push({ raw: rawClean, phone: rawClean, digits });
        }
      }
    });

    // 4. Experience Claims (e.g. "25 Years Experience")
    const experienceClaims = [];
    const expRegex = /(\d{1,3})\+?\s*(?:years?|yrs?)\s*(?:completed|of\s+experience|in\s+business|experience)/gi;
    let match;
    while ((match = expRegex.exec(cleanedText)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 200 && !experienceClaims.some(e => e.years === num)) {
        experienceClaims.push({ years: num, raw: this.cleanText(match[0]) });
      }
    }

    // 5. Founding Year Claims (e.g. "Since 1998")
    const foundingYears = [];
    const foundRegex = /(?:since|established(?:\s+in)?|est\.?)\s*(\d{4})/gi;
    while ((match = foundRegex.exec(cleanedText)) !== null) {
      const yr = parseInt(match[1], 10);
      if (!foundingYears.includes(yr)) foundingYears.push(yr);
    }

    // 6. Statutory Numbers (GST Number, ISO)
    const gstNumbers = (fullText.match(/\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
    const isoCertifications = (fullText.match(/ISO\s?\d{4,5}(?::\d{4})?/gi) || []).map(i => this.cleanText(i).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i);

    // 7. Pincode / Postal Codes
    const pincodes = (fullText.match(/\b\d{6}\b/g) || []).filter((v, i, a) => a.indexOf(v) === i);

    return {
      companyName,
      brandingRect: coords.branding?.rect || { x: 50, y: 25, width: 220, height: 45 },
      emails,
      emailObjects: coords.emails || [],
      phones,
      phoneObjects: coords.phones || [],
      experienceClaims,
      foundingYears,
      gstNumbers,
      isoCertifications,
      pincodes,
      coords,
      fullText: cleanedText
    };
  }

  /**
   * Conflict-Only Verification Engine
   * Validates matching facts and flags ONLY explicit data contradictions.
   * Extra/newly added localhost data is accepted and not flagged.
   */
  static verifyData(analysisA, analysisB) {
    const siteA = this.extractFactualEntities(analysisA);
    const siteB = this.extractFactualEntities(analysisB);

    const mismatches = [];

    // 1. Company Brand Conflict Check (Only if both define a brand name and they strictly conflict)
    if (siteA.companyName && siteB.companyName) {
      const normA = siteA.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normB = siteB.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normA.length > 2 && normB.length > 2 && !normA.includes(normB) && !normB.includes(normA)) {
        mismatches.push({
          category: 'Company Branding',
          field: 'Company / Brand Name',
          expectedValue: siteA.companyName,
          localhostValue: siteB.companyName,
          severity: 'CRITICAL',
          section: 'Header / Logo Area',
          rect: siteB.brandingRect,
          description: `Brand contradiction: Verified live company is "${siteA.companyName}", but localhost displays "${siteB.companyName}".`
        });
      }
    }

    // 2. Email Address Conflict Check
    if (siteA.emails.length > 0 && siteB.emails.length > 0) {
      const bEmailsMismatch = siteB.emails.filter(eB => !siteA.emails.some(eA => eA.toLowerCase() === eB.toLowerCase()));
      if (bEmailsMismatch.length > 0 && !siteB.emails.some(eB => siteA.emails.includes(eB))) {
        const wrongEmail = bEmailsMismatch[0];
        const expectedEmail = siteA.emails[0];
        const emailObj = siteB.emailObjects.find(e => e.email === wrongEmail) || siteB.emailObjects[0];
        mismatches.push({
          category: 'Contact Info',
          field: 'Official Email Address',
          expectedValue: expectedEmail,
          localhostValue: wrongEmail,
          severity: 'HIGH',
          section: 'Header / Contact / Footer',
          rect: emailObj?.rect || { x: 750, y: 30, width: 240, height: 35 },
          description: `Wrong email in localhost: Found "${wrongEmail}", but verified live email is "${expectedEmail}".`
        });
      }
    }

    // 3. Phone Number Conflict Check (Detects test numbers like "1234" and wrong phone numbers)
    if (siteB.phones.length > 0) {
      const wrongPhoneObj = siteB.phones.find(pB => {
        if (siteA.phones.length === 0) return pB.digits.length < 8;
        return !siteA.phones.some(pA => pA.digits === pB.digits);
      });

      if (wrongPhoneObj) {
        const expectedPhoneObj = siteA.phones[0] || null;
        const expectedVal = expectedPhoneObj ? (expectedPhoneObj.raw || expectedPhoneObj.phone) : 'Verified Phone Number';
        const localhostVal = wrongPhoneObj.raw || wrongPhoneObj.phone || wrongPhoneObj.digits || '1234';
        const phoneRect = wrongPhoneObj.rect || siteB.phoneObjects[0]?.rect || { x: 550, y: 30, width: 180, height: 35 };

        mismatches.push({
          category: 'Contact Info',
          field: 'Official Phone Number',
          expectedValue: expectedVal,
          localhostValue: localhostVal,
          severity: 'HIGH',
          section: 'Header / Contact / CTA Button',
          rect: phoneRect,
          description: `Wrong contact number in localhost: Found "${localhostVal}", but verified live phone is "${expectedVal}".`
        });
      }
    }

    // 4. Experience Years Conflict Check (e.g. 5 years vs 60 years)
    if (siteA.experienceClaims.length > 0 && siteB.experienceClaims.length > 0) {
      const expA = siteA.experienceClaims[0];
      const expB = siteB.experienceClaims[0];
      if (expA.years !== expB.years) {
        const statRect = siteB.coords.headings.find(h => h.text.includes(String(expB.years)))?.rect || { x: 200, y: 450, width: 220, height: 60 };
        mismatches.push({
          category: 'Company Credentials',
          field: 'Years of Experience',
          expectedValue: `${expA.years} Years (${expA.raw})`,
          localhostValue: `${expB.years} Years (${expB.raw})`,
          severity: 'HIGH',
          section: 'About / Experience Counter',
          rect: statRect,
          description: `Experience contradiction: Live website verified ${expA.years} years, but localhost states ${expB.years} years.`
        });
      }
    }

    // 5. Founding / Established Year Conflict Check
    if (siteA.foundingYears.length > 0 && siteB.foundingYears.length > 0) {
      const foundA = siteA.foundingYears[0];
      const foundB = siteB.foundingYears[0];
      if (foundA !== foundB) {
        mismatches.push({
          category: 'Company Credentials',
          field: 'Founding / Establishment Year',
          expectedValue: `Since ${foundA}`,
          localhostValue: `Since ${foundB}`,
          severity: 'HIGH',
          section: 'About / Header / Footer',
          rect: { x: 200, y: 400, width: 200, height: 50 },
          description: `Founding year contradiction: Live website is established in ${foundA}, but localhost states ${foundB}.`
        });
      }
    }

    // 6. GST Number Conflict Check
    if (siteA.gstNumbers.length > 0 && siteB.gstNumbers.length > 0) {
      const gstA = siteA.gstNumbers[0];
      const gstB = siteB.gstNumbers[0];
      if (gstA !== gstB) {
        mismatches.push({
          category: 'Legal & Tax Identification',
          field: 'GST Number',
          expectedValue: gstA,
          localhostValue: gstB,
          severity: 'HIGH',
          section: 'Footer / Legal Bar',
          rect: { x: 100, y: 800, width: 300, height: 40 },
          description: `Wrong GST Number: Live website GST is "${gstA}", but localhost has "${gstB}".`
        });
      }
    }

    // 7. Postal Pincode Conflict Check (Only if both define a location pincode and they contradict)
    if (siteA.pincodes.length > 0 && siteB.pincodes.length > 0) {
      const pinA = siteA.pincodes[0];
      const pinB = siteB.pincodes[0];
      if (pinA !== pinB && !siteB.fullText.includes(pinA)) {
        mismatches.push({
          category: 'Business Location',
          field: 'Postal Pincode',
          expectedValue: pinA,
          localhostValue: pinB,
          severity: 'MEDIUM',
          section: 'Contact / Footer Address',
          rect: { x: 300, y: 780, width: 150, height: 40 },
          description: `Location pincode contradiction: Verified location pincode is ${pinA}, but localhost displays ${pinB}.`
        });
      }
    }

    // 8. Style & Theme Color Audits
    const paletteA = analysisA.colorPalette || { backgrounds: [], texts: [] };
    const paletteB = analysisB.colorPalette || { backgrounds: [], texts: [] };
    
    if (paletteA.backgrounds.length > 0 && paletteB.backgrounds.length > 0) {
      const primaryBgA = paletteA.backgrounds[0];
      const primaryBgB = paletteB.backgrounds[0];
      if (primaryBgA.toLowerCase() !== primaryBgB.toLowerCase()) {
        mismatches.push({
          category: 'Visual Style',
          field: 'Dominant Background Color',
          expectedValue: primaryBgA,
          localhostValue: primaryBgB,
          severity: 'MEDIUM',
          section: 'Entire Page',
          rect: { x: 0, y: 0, width: 1440, height: 900 },
          description: `Theme discrepancy: Verified reference uses background "${primaryBgA}", but localhost uses "${primaryBgB}".`
        });
      }
    }
    
    if (paletteA.texts.length > 0 && paletteB.texts.length > 0) {
      const primaryTextA = paletteA.texts[0];
      const primaryTextB = paletteB.texts[0];
      if (primaryTextA.toLowerCase() !== primaryTextB.toLowerCase()) {
        mismatches.push({
          category: 'Visual Style',
          field: 'Dominant Text Color',
          expectedValue: primaryTextA,
          localhostValue: primaryTextB,
          severity: 'LOW',
          section: 'Entire Page',
          rect: { x: 0, y: 0, width: 1440, height: 100 },
          description: `Typography discrepancy: Verified reference text color is "${primaryTextA}", but localhost uses "${primaryTextB}".`
        });
      }
    }

    return {
      totalMismatches: mismatches.length,
      mismatches,
      isDataAccurate: mismatches.length === 0,
      timestamp: new Date().toISOString(),
      colorPaletteA: paletteA,
      colorPaletteB: paletteB
    };
  }

  /**
   * Generates Targeted AI Data Correction Prompts
   */
  static generateDataFixPrompts(dataVerificationResult, localhostUrl, verifiedSourceUrl) {
    const { mismatches } = dataVerificationResult;
    const sectionPrompts = [];

    const grouped = {};
    mismatches.forEach(m => {
      const cat = m.category || 'General Business Data';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m);
    });

    Object.keys(grouped).forEach((categoryName, idx) => {
      const items = grouped[categoryName];

      let prompt = `### 🎯 FIX FACTUAL CONFLICT: ${categoryName}\n\n`;
      prompt += `> ⚠️ **STRICT INSTRUCTION**: DO NOT change your new UI, design, layout, or any newly added competitor/revamp features. **ONLY correct the wrong factual numbers/data values** in localhost code/state/props/JSON.\n\n`;
      prompt += `**Verified Live Source**: ${verifiedSourceUrl}\n`;
      prompt += `**Localhost Target Being Corrected**: ${localhostUrl}\n\n`;
      prompt += `#### 📋 Factual Corrections to Apply:\n`;

      items.forEach((item, itemIdx) => {
        prompt += `\n**${itemIdx + 1}. ${item.field}** (Location: ${item.section}):\n`;
        prompt += `- ❌ **Wrong Value in Localhost**: "${item.localhostValue}"\n`;
        prompt += `- ✅ **True Verified Value**: "${item.expectedValue}"\n`;
        prompt += `- ℹ️ *Why*: ${item.description}\n`;
      });

      prompt += `\n#### 💻 Code Fix Instruction:\n`;
      prompt += `Please update the data variable/text in the component to use the true verified value. Keep all other newly added features and revamped styling untouched.`;

      sectionPrompts.push({
        sectionIndex: idx + 1,
        sectionName: categoryName,
        title: `Fix ${categoryName}`,
        prompt,
        totalErrors: items.length,
        errors: items
      });
    });

    // Master Prompt
    let masterDataPrompt = `# 🎯 MASTER FACTUAL DATA CORRECTION PROMPT\n\n`;
    masterDataPrompt += `> ⚠️ **STRICT RULE**: Keep all new UI styles, layout improvements, and newly added revamp features 100% untouched. ONLY fix the conflicting/wrong data values below.\n\n`;
    masterDataPrompt += `**Verified Live Source**: ${verifiedSourceUrl}\n`;
    masterDataPrompt += `**Localhost Target**: ${localhostUrl}\n`;
    masterDataPrompt += `**Total Contradictions to Correct**: ${mismatches.length}\n\n`;
    masterDataPrompt += `## 📋 Corrections by Component:\n\n`;

    Object.keys(grouped).forEach((cat, i) => {
      masterDataPrompt += `### ${i + 1}. \`${cat}\`\n`;
      grouped[cat].forEach(m => {
        masterDataPrompt += `- **${m.field}**: Replace "${m.localhostValue}" ➔ "${m.expectedValue}" (${m.section})\n`;
      });
      masterDataPrompt += `\n`;
    });

    masterDataPrompt += `## Final Directive:\n`;
    masterDataPrompt += `Update only the conflicting values in your codebase. Preserve all new UI components, styling, and newly added revamp sections.`;

    return {
      sectionPrompts,
      masterDataPrompt,
      totalPrompts: sectionPrompts.length,
      totalErrors: mismatches.length
    };
  }
}

module.exports = DataVerifier;
