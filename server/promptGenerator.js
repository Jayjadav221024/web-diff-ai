/**
 * Automated Section-by-Section AI Prompt Generator
 * Generates ready-to-use prompts for ChatGPT, Claude, Cursor, Copilot, and Antigravity
 */
class PromptGenerator {
  /**
   * Generates AI prompts from a side-by-side comparison diff
   */
  static generateDiffPrompts(diffResult, analysisA, analysisB) {
    const sectionPrompts = [];
    const changedSections = diffResult.sectionDiffs.filter(s => s.isChanged);

    changedSections.forEach((sec, idx) => {
      let promptText = `### Section Task: Update & Reconcile ${sec.type}\n`;
      promptText += `**Target Component / Element**: \`${sec.selectorB || sec.selectorA}\`\n\n`;
      promptText += `**Goal**: Update the "${sec.type}" component in the codebase to align with the target design/specification.\n\n`;

      promptText += `#### 📋 Required Modifications:\n`;

      // Style changes
      if (sec.styleDiffs && sec.styleDiffs.length > 0) {
        promptText += `\n**1. CSS & Style Updates:**\n`;
        sec.styleDiffs.forEach(sd => {
          promptText += `- Change \`${sd.property}\` from \`${sd.siteA}\` to \`${sd.siteB}\`\n`;
        });
      }

      // Text changes
      if (sec.hasTextChanges && sec.textDiffChunks) {
        promptText += `\n**2. Content & Copy Revisions:**\n`;
        const additions = sec.textDiffChunks.filter(c => c.added).map(c => c.value.trim()).filter(Boolean);
        const removals = sec.textDiffChunks.filter(c => c.removed).map(c => c.value.trim()).filter(Boolean);

        if (removals.length > 0) {
          promptText += `- **Remove / Replace old text**:\n  > "${removals.slice(0, 3).join(' ')}"\n`;
        }
        if (additions.length > 0) {
          promptText += `- **Add target text**:\n  > "${additions.slice(0, 3).join(' ')}"\n`;
        }
      }

      // Button / CTA changes
      if (sec.buttonDiffs && sec.buttonDiffs.length > 0) {
        promptText += `\n**3. Interactive Buttons / CTAs:**\n`;
        sec.buttonDiffs.forEach(b => {
          if (b.type === 'modified') {
            promptText += `- Update button label from "${b.textA}" to "${b.textB}"\n`;
          } else if (b.type === 'added') {
            promptText += `- Add missing CTA button: "${b.button.text}"\n`;
          } else if (b.type === 'removed') {
            promptText += `- Remove outdated button: "${b.button.text}"\n`;
          }
        });
      }

      // Image changes
      if (sec.imageDiffs && sec.imageDiffs.length > 0) {
        promptText += `\n**4. Media & Assets:**\n`;
        sec.imageDiffs.forEach(img => {
          if (img.type === 'modified_src') {
            promptText += `- Update image source URL from \`${img.srcA}\` to \`${img.srcB}\`\n`;
          } else if (img.type === 'added') {
            promptText += `- Add new image asset (src: \`${img.image.src}\`, alt: "${img.image.alt || 'None'}")\n`;
          }
        });
      }

      promptText += `\n#### 💻 Instruction for AI:\n`;
      promptText += `Please write the exact HTML, JSX/TSX or CSS code modifications needed to implement these changes cleanly for the \`${sec.selectorB || sec.selectorA}\` section.`;

      sectionPrompts.push({
        sectionIndex: sec.sectionIndex,
        sectionType: sec.type,
        selector: sec.selectorB || sec.selectorA,
        title: `AI Prompt: ${sec.type} Fix`,
        prompt: promptText,
        styleDiffsCount: sec.styleDiffs ? sec.styleDiffs.length : 0,
        hasTextChanges: sec.hasTextChanges,
        buttonDiffsCount: sec.buttonDiffs ? sec.buttonDiffs.length : 0
      });
    });

    // Master Unified Prompt for all changes
    let masterPrompt = `# Master AI Coding Prompt: Website Sync & Alignment\n\n`;
    masterPrompt += `**Baseline Source**: ${diffResult.siteAUrl}\n`;
    masterPrompt += `**Target Destination**: ${diffResult.siteBUrl}\n`;
    masterPrompt += `**Visual Discrepancy**: ${diffResult.visualDiff.diffPercentage}% pixel difference detected across ${changedSections.length} sections.\n\n`;
    masterPrompt += `## Step-by-Step Implementation Instructions:\n\n`;

    changedSections.forEach((sec, idx) => {
      masterPrompt += `### Step ${idx + 1}: Update \`${sec.type}\` (\`${sec.selectorB || sec.selectorA}\`)\n`;
      if (sec.styleDiffs && sec.styleDiffs.length > 0) {
        masterPrompt += `- **CSS Styles**: ${sec.styleDiffs.map(s => `${s.property}: ${s.siteB} (was ${s.siteA})`).join('; ')}\n`;
      }
      if (sec.hasTextChanges) {
        masterPrompt += `- **Content**: Sync text copy with target version.\n`;
      }
      if (sec.buttonDiffs && sec.buttonDiffs.length > 0) {
        masterPrompt += `- **Buttons**: Adjust CTA labels and actions.\n`;
      }
      masterPrompt += `\n`;
    });

    masterPrompt += `\n## Request:\n`;
    masterPrompt += `Please provide the complete, refactored code updates to apply all the above changes sequentially with clean, maintainable code.`;

    return {
      sectionPrompts,
      masterPrompt,
      totalPrompts: sectionPrompts.length
    };
  }

  /**
   * Generates AI prompts from a single website audit
   */
  static generateAuditPrompts(analysis) {
    const prompts = [];

    // 1. SEO & Metadata Prompt
    let seoPrompt = `### AI Prompt: Complete SEO & Metadata Optimization\n`;
    seoPrompt += `**Website URL**: ${analysis.url}\n\n`;
    seoPrompt += `Current Page Title: "${analysis.meta.title}"\n`;
    seoPrompt += `Current Meta Description: "${analysis.meta.description || 'MISSING'}"\n\n`;
    seoPrompt += `**Task**: Generate high-converting SEO tags, Open Graph meta tags, Twitter cards, and structured JSON-LD schema markup tailored specifically for this website's content.`;

    prompts.push({
      title: 'SEO & Metadata Optimization',
      type: 'SEO',
      prompt: seoPrompt
    });

    // 2. Section Enhancement Prompts
    analysis.sections.forEach(sec => {
      let secPrompt = `### AI Prompt: Refactor & Modernize ${sec.type}\n`;
      secPrompt += `**Target Selector**: \`${sec.selector}\`\n`;
      secPrompt += `**Current Typography**: Font: ${sec.styles.fontFamily}, Size: ${sec.styles.fontSize}, Weight: ${sec.styles.fontWeight}\n`;
      secPrompt += `**Current Colors**: Background: ${sec.styles.backgroundColor}, Text: ${sec.styles.color}\n`;
      secPrompt += `**Current Text Snippet**: "${sec.textSnippet}"\n\n`;
      secPrompt += `**Task**: Rewrite and redesign this ${sec.type} component into modern, responsive, accessible Tailwind/Vanilla CSS & HTML with smooth hover animations and clean visual hierarchy.`;

      prompts.push({
        title: `Modernize ${sec.type}`,
        type: 'Component Refactor',
        selector: sec.selector,
        prompt: secPrompt
      });
    });

    // 3. Accessibility & Image Alt Tag Prompt
    const missingAltImages = analysis.allImages.filter(img => img.isMissingAlt);
    if (missingAltImages.length > 0) {
      let a11yPrompt = `### AI Prompt: Fix Accessibility & Missing Alt Tags\n`;
      a11yPrompt += `The following ${missingAltImages.length} images are missing descriptive \`alt\` attributes:\n`;
      missingAltImages.slice(0, 10).forEach(img => {
        a11yPrompt += `- Image: \`${img.src.substring(0, 80)}...\`\n`;
      });
      a11yPrompt += `\n**Task**: Provide descriptive, accessible, SEO-rich \`alt\` text for each of these images.`;

      prompts.push({
        title: 'Accessibility & Alt Tag Fixes',
        type: 'Accessibility',
        prompt: a11yPrompt
      });
    }

    return {
      prompts,
      totalPrompts: prompts.length
    };
  }
}

module.exports = PromptGenerator;
