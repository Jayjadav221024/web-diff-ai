const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const Diff = require('diff');

/**
 * Micro-Diff Engine for Visual, DOM, Text, and CSS Discrepancies
 */
class DiffEngine {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, 'storage');
    this.diffsDir = path.join(this.storageDir, 'diffs');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
    if (!fs.existsSync(this.diffsDir)) fs.mkdirSync(this.diffsDir, { recursive: true });
  }

  /**
   * Visual Pixel Diff comparison between two PNG files
   */
  async compareVisuals(imgAPath, imgBPath, diffId = `diff_${Date.now()}`) {
    if (!fs.existsSync(imgAPath) || !fs.existsSync(imgBPath)) {
      return {
        error: 'One or both screenshot files not found for visual diff.',
        diffPercentage: 0,
        diffPixels: 0
      };
    }

    try {
      const imgA = PNG.sync.read(fs.readFileSync(imgAPath));
      const imgB = PNG.sync.read(fs.readFileSync(imgBPath));

      const maxWidth = Math.max(imgA.width, imgB.width);
      const maxHeight = Math.max(imgA.height, imgB.height);

      // Normalize images to same dimensions for pixelmatch
      const normalizedA = this.padImage(imgA, maxWidth, maxHeight);
      const normalizedB = this.padImage(imgB, maxWidth, maxHeight);

      const diff = new PNG({ width: maxWidth, height: maxHeight });

      const diffPixels = pixelmatch(
        normalizedA.data,
        normalizedB.data,
        diff.data,
        maxWidth,
        maxHeight,
        {
          threshold: 0.1,
          includeAA: false,
          diffColor: [255, 0, 110], // Vibrant Magenta for diff pixels
          diffColorAlt: [0, 240, 255] // Cyan for secondary diff
        }
      );

      const totalPixels = maxWidth * maxHeight;
      const diffPercentage = Number(((diffPixels / totalPixels) * 100).toFixed(2));

      const diffFilename = `${diffId}_visual_diff.png`;
      const diffFilePath = path.join(this.diffsDir, diffFilename);
      fs.writeFileSync(diffFilePath, PNG.sync.write(diff));

      return {
        diffFilename,
        diffPath: diffFilePath,
        diffUrlPath: `/storage/diffs/${diffFilename}`,
        diffPixels,
        totalPixels,
        diffPercentage,
        isVisuallyIdentical: diffPixels === 0,
        dimensions: {
          width: maxWidth,
          height: maxHeight
        }
      };
    } catch (err) {
      return {
        error: `Visual comparison failed: ${err.message}`,
        diffPercentage: 0,
        diffPixels: 0
      };
    }
  }

  padImage(img, targetWidth, targetHeight) {
    if (img.width === targetWidth && img.height === targetHeight) return img;
    const padded = new PNG({ width: targetWidth, height: targetHeight });
    padded.data.fill(255); // White background
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const srcIdx = (img.width * y + x) << 2;
        const tgtIdx = (targetWidth * y + x) << 2;
        padded.data[tgtIdx] = img.data[srcIdx];
        padded.data[tgtIdx + 1] = img.data[srcIdx + 1];
        padded.data[tgtIdx + 2] = img.data[srcIdx + 2];
        padded.data[tgtIdx + 3] = img.data[srcIdx + 3];
      }
    }
    return padded;
  }

  /**
   * Deep Micro-Diff of two page analysis results (Site A vs Site B)
   */
  async comparePageAnalyses(analysisA, analysisB, diffId = `diff_${Date.now()}`) {
    // 1. Visual Pixel Diff
    const visualDiff = await this.compareVisuals(
      analysisA.screenshot.path,
      analysisB.screenshot.path,
      diffId
    );

    // 2. Metadata Diff
    const metadataDiff = {
      title: {
        siteA: analysisA.meta.title,
        siteB: analysisB.meta.title,
        isEqual: analysisA.meta.title === analysisB.meta.title
      },
      description: {
        siteA: analysisA.meta.description,
        siteB: analysisB.meta.description,
        isEqual: analysisA.meta.description === analysisB.meta.description
      },
      headingsCount: {
        siteA: (analysisA.headings || []).length,
        siteB: (analysisB.headings || []).length,
        isEqual: (analysisA.headings || []).length === (analysisB.headings || []).length
      },
      imagesCount: {
        siteA: (analysisA.allImages || []).length,
        siteB: (analysisB.allImages || []).length,
        isEqual: (analysisA.allImages || []).length === (analysisB.allImages || []).length
      },
      linksCount: {
        siteA: (analysisA.allLinks || []).length,
        siteB: (analysisB.allLinks || []).length,
        isEqual: (analysisA.allLinks || []).length === (analysisB.allLinks || []).length
      }
    };

    // 3. Granular Text Diffing
    const secAText = (analysisA.sections || []).map(s => s.fullText || '').join('\n\n');
    const secBText = (analysisB.sections || []).map(s => s.fullText || '').join('\n\n');
    const textDiffChunks = Diff.diffWords(secAText, secBText);

    const addedWordsCount = textDiffChunks.filter(c => c.added).reduce((acc, c) => acc + (c.value || '').split(/\s+/).length, 0);
    const removedWordsCount = textDiffChunks.filter(c => c.removed).reduce((acc, c) => acc + (c.value || '').split(/\s+/).length, 0);

    // 4. Section-by-Section Micro-Diff
    const sectionDiffs = [];
    const secAList = analysisA.sections || [];
    const secBList = analysisB.sections || [];
    const maxSections = Math.max(secAList.length, secBList.length);

    for (let i = 0; i < maxSections; i++) {
      const secA = analysisA.sections[i] || null;
      const secB = analysisB.sections[i] || null;

      if (secA && secB) {
        // Compare styles
        const styleDiffs = [];
        const stylesA = secA.styles || {};
        const stylesB = secB.styles || {};
        const checkedProps = [
          'backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight',
          'lineHeight', 'padding', 'margin', 'borderRadius', 'display'
        ];

        checkedProps.forEach(prop => {
          if (stylesA[prop] !== stylesB[prop]) {
            styleDiffs.push({
              property: prop,
              siteA: stylesA[prop] || 'default',
              siteB: stylesB[prop] || 'default'
            });
          }
        });

        // Compare text
        const secTextDiff = Diff.diffWords(secA.fullText || '', secB.fullText || '');
        const hasTextChanges = secTextDiff.some(c => c.added || c.removed);

        // Compare buttons
        const btnDiffs = [];
        const btnsA = secA.buttons || [];
        const btnsB = secB.buttons || [];
        const maxBtns = Math.max(btnsA.length, btnsB.length);
        for (let b = 0; b < maxBtns; b++) {
          const btnA = btnsA[b];
          const btnB = btnsB[b];
          if (!btnA && btnB) btnDiffs.push({ type: 'added', button: btnB });
          else if (btnA && !btnB) btnDiffs.push({ type: 'removed', button: btnA });
          else if (btnA && btnB && btnA.text !== btnB.text) {
            btnDiffs.push({ type: 'modified', textA: btnA.text, textB: btnB.text, btnA, btnB });
          }
        }

        // Compare images in section
        const imgDiffs = [];
        const imgsA = secA.images || [];
        const imgsB = secB.images || [];
        const maxImgs = Math.max(imgsA.length, imgsB.length);
        for (let m = 0; m < maxImgs; m++) {
          const imgA = imgsA[m];
          const imgB = imgsB[m];
          if (!imgA && imgB) imgDiffs.push({ type: 'added', image: imgB });
          else if (imgA && !imgB) imgDiffs.push({ type: 'removed', image: imgA });
          else if (imgA && imgB && imgA.src !== imgB.src) {
            imgDiffs.push({ type: 'modified_src', srcA: imgA.src, srcB: imgB.src });
          }
        }

        const isChanged = styleDiffs.length > 0 || hasTextChanges || btnDiffs.length > 0 || imgDiffs.length > 0;

        sectionDiffs.push({
          sectionIndex: i + 1,
          type: secA.type === secB.type ? secA.type : `${secA.type} ➔ ${secB.type}`,
          selectorA: secA.selector,
          selectorB: secB.selector,
          isChanged,
          styleDiffs,
          hasTextChanges,
          textDiffChunks: hasTextChanges ? secTextDiff : [],
          buttonDiffs: btnDiffs,
          imageDiffs: imgDiffs,
          secA,
          secB
        });

      } else if (secA && !secB) {
        sectionDiffs.push({
          sectionIndex: i + 1,
          type: secA.type,
          selectorA: secA.selector,
          isChanged: true,
          status: 'removed_in_site_b',
          secA,
          secB: null
        });
      } else if (!secA && secB) {
        sectionDiffs.push({
          sectionIndex: i + 1,
          type: secB.type,
          selectorB: secB.selector,
          isChanged: true,
          status: 'added_in_site_b',
          secA: null,
          secB
        });
      }
    }

    // 5. Compute Overall Change Score & Summary
    const totalChangesCount = sectionDiffs.filter(s => s.isChanged).length;
    const changeSeverity = visualDiff.diffPercentage > 20 ? 'HIGH' : visualDiff.diffPercentage > 5 ? 'MEDIUM' : totalChangesCount > 0 ? 'LOW' : 'IDENTICAL';

    return {
      diffId,
      timestamp: new Date().toISOString(),
      siteAUrl: analysisA.url,
      siteBUrl: analysisB.url,
      visualDiff,
      metadataDiff,
      textStats: {
        addedWordsCount,
        removedWordsCount,
        hasTextChanges: addedWordsCount > 0 || removedWordsCount > 0
      },
      textDiffChunks: textDiffChunks.slice(0, 100),
      sectionDiffs,
      summary: {
        totalSectionsCompared: maxSections,
        changedSectionsCount: totalChangesCount,
        visualDiffPercentage: visualDiff.diffPercentage,
        changeSeverity
      }
    };
  }
}

module.exports = DiffEngine;
