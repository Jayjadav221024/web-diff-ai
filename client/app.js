/**
 * WebDiff AI - Main Frontend Application Logic
 * Supports Data-Only Verification (NO UI/Color changes) & Full Comparison
 */
document.addEventListener('DOMContentLoaded', () => {
  const diffViewer = new VisualDiffViewer();

  // State
  let currentMode = 'data-verify';
  let currentResult = null;
  let eventSource = null;

  // AI Settings elements
  const claudeApiKeyInput = document.getElementById('claudeApiKey');
  const enableClaudeVerifyCheckbox = document.getElementById('enableClaudeVerify');
  const enableClaudeVisionCheckbox = document.getElementById('enableClaudeVision');
  const visionToggleWrapper = document.getElementById('visionToggleWrapper');
  const claudeSettingsToggle = document.getElementById('claudeSettingsToggle');
  const claudeSettingsContent = document.getElementById('claudeSettingsContent');
  const claudeChevron = document.getElementById('claudeChevron');
  const claudeSettingsPanel = document.querySelector('.claude-settings-panel');
  const toggleApiKeyVisibilityBtn = document.getElementById('toggleApiKeyVisibility');
  const apiKeyVisibilityIcon = document.getElementById('apiKeyVisibilityIcon');

  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const apiKeyLabelText = document.getElementById('apiKeyLabelText');
  const openRouterModelGroup = document.getElementById('openRouterModelGroup');
  const openRouterModelInput = document.getElementById('openRouterModel');

  // Load provider settings from localStorage
  const defaultProvider = localStorage.getItem('ai_provider') || 'claude';
  if (aiProviderSelect) {
    aiProviderSelect.value = defaultProvider;
  }
  if (openRouterModelInput) {
    openRouterModelInput.value = localStorage.getItem('openrouter_model') || 'openrouter/free';
  }

  // Helper to sync provider UI elements
  function syncProviderUI() {
    const provider = aiProviderSelect ? aiProviderSelect.value : 'claude';
    if (provider === 'openrouter') {
      if (apiKeyLabelText) apiKeyLabelText.innerText = 'OpenRouter API Key';
      if (claudeApiKeyInput) {
        claudeApiKeyInput.placeholder = 'sk-or-v1-...';
        claudeApiKeyInput.value = localStorage.getItem('openrouter_api_key') || '';
      }
      openRouterModelGroup?.classList.remove('hidden');
    } else {
      if (apiKeyLabelText) apiKeyLabelText.innerText = 'Claude API Key (Anthropic)';
      if (claudeApiKeyInput) {
        claudeApiKeyInput.placeholder = 'sk-ant-api03-...';
        claudeApiKeyInput.value = localStorage.getItem('claude_api_key') || '';
      }
      openRouterModelGroup?.classList.add('hidden');
    }
  }

  // Load keys from localStorage
  syncProviderUI();

  if (enableClaudeVerifyCheckbox) {
    enableClaudeVerifyCheckbox.checked = localStorage.getItem('claude_enable_verify') === 'true';
    setTimeout(() => toggleVisionState(), 50); // Ensure DOM state is sync'd
  }
  if (enableClaudeVisionCheckbox) {
    enableClaudeVisionCheckbox.checked = localStorage.getItem('claude_enable_vision') === 'true';
  }
  const compareAllPagesCheckbox = document.getElementById('compareAllPages');
  if (compareAllPagesCheckbox) {
    compareAllPagesCheckbox.checked = localStorage.getItem('compare_all_pages') === 'true';
  }

  // Handle provider switch
  aiProviderSelect?.addEventListener('change', (e) => {
    localStorage.setItem('ai_provider', e.target.value);
    syncProviderUI();
  });

  // Save keys to localStorage when changed
  claudeApiKeyInput?.addEventListener('input', (e) => {
    const provider = aiProviderSelect ? aiProviderSelect.value : 'claude';
    if (provider === 'openrouter') {
      localStorage.setItem('openrouter_api_key', e.target.value);
    } else {
      localStorage.setItem('claude_api_key', e.target.value);
    }
  });

  openRouterModelInput?.addEventListener('input', (e) => {
    localStorage.setItem('openrouter_model', e.target.value);
  });

  enableClaudeVerifyCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('claude_enable_verify', e.target.checked);
    toggleVisionState();
  });
  enableClaudeVisionCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('claude_enable_vision', e.target.checked);
  });
  compareAllPagesCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('compare_all_pages', e.target.checked);
  });

  function toggleVisionState() {
    const isVerifyEnabled = enableClaudeVerifyCheckbox?.checked;
    if (isVerifyEnabled) {
      visionToggleWrapper?.classList.remove('disabled');
      enableClaudeVisionCheckbox?.removeAttribute('disabled');
    } else {
      visionToggleWrapper?.classList.add('disabled');
      enableClaudeVisionCheckbox?.setAttribute('disabled', 'true');
      if (enableClaudeVisionCheckbox) {
        enableClaudeVisionCheckbox.checked = false;
      }
      localStorage.setItem('claude_enable_vision', 'false');
    }
  }

  // API Key Visibility Toggle
  toggleApiKeyVisibilityBtn?.addEventListener('click', () => {
    const isMasked = claudeApiKeyInput.classList.contains('masked');
    if (isMasked) {
      claudeApiKeyInput.classList.remove('masked');
    } else {
      claudeApiKeyInput.classList.add('masked');
    }
    apiKeyVisibilityIcon.setAttribute('data-lucide', isMasked ? 'eye-off' : 'eye');
    lucide.createIcons();
  });

  // Collapsible settings header click
  claudeSettingsToggle?.addEventListener('click', () => {
    claudeSettingsContent.classList.toggle('hidden');
    claudeSettingsPanel.classList.toggle('open');
  });

  // DOM Elements
  const modeDataVerifyBtn = document.getElementById('modeDataVerifyBtn');
  const modeCompareBtn = document.getElementById('modeCompareBtn');
  const modeAuditBtn = document.getElementById('modeAuditBtn');
  const compareForm = document.getElementById('compareForm');
  const auditForm = document.getElementById('auditForm');
  const dataModeNotice = document.getElementById('dataModeNotice');
  const submitBtnText = document.getElementById('submitBtnText');

  const progressContainer = document.getElementById('progressContainer');
  const progressTitle = document.getElementById('progressTitle');
  const progressSub = document.getElementById('progressSub');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const liveTerminal = document.getElementById('liveTerminal');

  const resultsContainer = document.getElementById('resultsContainer');
  const bannerStats = document.getElementById('bannerStats');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerSubtitle = document.getElementById('bannerSubtitle');

  const dataPromptsList = document.getElementById('dataPromptsList');
  const dataMismatchesTableBody = document.getElementById('dataMismatchesTableBody');
  const sectionsGrid = document.getElementById('sectionsGrid');
  const textDiffBox = document.getElementById('textDiffBox');

  const badgeDataFixesCount = document.getElementById('badgeDataFixesCount');
  const badgeMismatchesCount = document.getElementById('badgeMismatchesCount');

  // Quick Localhost Chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const url = chip.dataset.url;
      const urlBInput = document.getElementById('urlB');
      const urlAInput = document.getElementById('urlA');
      if (currentMode === 'audit') {
        document.getElementById('auditUrl').value = url;
      } else {
        if (!urlAInput.value) {
          urlAInput.value = url;
        } else {
          urlBInput.value = url;
        }
      }
      showToast(`Selected localhost URL: ${url}`);
    });
  });

  // Mode Switcher
  modeDataVerifyBtn?.addEventListener('click', () => setMode('data-verify'));
  modeCompareBtn?.addEventListener('click', () => setMode('compare'));
  modeAuditBtn?.addEventListener('click', () => setMode('audit'));

  function setMode(mode) {
    currentMode = mode;
    [modeDataVerifyBtn, modeCompareBtn, modeAuditBtn].forEach(b => b?.classList.remove('active'));

    if (mode === 'data-verify') {
      modeDataVerifyBtn.classList.add('active');
      compareForm.classList.remove('hidden');
      auditForm.classList.add('hidden');
      dataModeNotice.classList.remove('hidden');
      submitBtnText.innerText = 'Verify Data & Generate Localhost Fix Prompts';
    } else if (mode === 'compare') {
      modeCompareBtn.classList.add('active');
      compareForm.classList.remove('hidden');
      auditForm.classList.add('hidden');
      dataModeNotice.classList.add('hidden');
      submitBtnText.innerText = 'Run Full UI & Visual Micro-Diff';
    } else {
      modeAuditBtn.classList.add('active');
      auditForm.classList.remove('hidden');
      compareForm.classList.add('hidden');
    }
  }

  // Theme Toggle
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    themeIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
    lucide.createIcons();
    showToast(`Switched to ${isLight ? 'Light' : 'Dark'} Mode`);
  });

  const viewportMap = {
    desktop: { width: 1440, height: 900 },
    laptop: { width: 1920, height: 1080 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 }
  };

  // Compare & Verify Form Submit
  compareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const urlA = document.getElementById('urlA').value.trim();
    const urlB = document.getElementById('urlB').value.trim();
    const vpSelect = document.getElementById('viewportSelect');
    const vpKey = vpSelect ? vpSelect.value : 'desktop';

    if (!urlA || !urlB) {
      showToast('Please provide both Verified Reference (Site A) and Localhost (Site B) URLs', 'error');
      return;
    }

    const useClaude = enableClaudeVerifyCheckbox ? enableClaudeVerifyCheckbox.checked : false;
    const useVision = enableClaudeVisionCheckbox ? enableClaudeVisionCheckbox.checked : false;
    const apiKey = claudeApiKeyInput ? claudeApiKeyInput.value.trim() : '';
    const aiProvider = aiProviderSelect ? aiProviderSelect.value : 'claude';
    const openRouterModel = openRouterModelInput ? openRouterModelInput.value.trim() : '';

    startProgressUI(
      useClaude 
        ? (aiProvider === 'openrouter' 
            ? `Invoking OpenRouter AI Verification (${openRouterModel}) (Vision: ${useVision ? 'ON' : 'OFF'})...`
            : `Invoking Claude 3.5 Sonnet Semantic Verification (Vision: ${useVision ? 'ON' : 'OFF'})...`)
        : (currentMode === 'data-verify' ? 'Verifying Localhost Data Integrity (No UI/Color Changes)...' : 'Comparing Websites...')
    );

    try {
      const resp = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urlA,
          urlB,
          mode: currentMode,
          viewport: viewportMap[vpKey] || viewportMap.desktop,
          useClaude,
          useVision,
          apiKey,
          aiProvider,
          openRouterModel,
          compareAllPages: compareAllPagesCheckbox ? compareAllPagesCheckbox.checked : false
        })
      });
      const data = await resp.json();
      if (data.error) {
        throw new Error(data.error);
      }
      subscribeProgress(data.jobId);
    } catch (err) {
      showToast(err.message, 'error');
      hideProgressUI();
    }
  });

  // Audit Form Submit
  auditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('auditUrl').value.trim();
    const maxPages = document.getElementById('maxPages').value;
    const vpSelect = document.getElementById('auditViewport');
    const vpKey = vpSelect ? vpSelect.value : 'desktop';

    if (!url) {
      showToast('Please provide a website or localhost URL to audit', 'error');
      return;
    }

    startProgressUI('Crawling Website & Extracting Deep Structure...');
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          maxPages: parseInt(maxPages, 10),
          maxDepth: 2,
          viewport: viewportMap[vpKey] || viewportMap.desktop
        })
      });
      const data = await resp.json();
      if (data.error) {
        throw new Error(data.error);
      }
      subscribeProgress(data.jobId);
    } catch (err) {
      showToast(err.message, 'error');
      hideProgressUI();
    }
  });

  // SSE & Polling Progress Stream
  function subscribeProgress(jobId) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/progress/${jobId}`);

    let isCompleted = false;
    let pollInterval = null;

    const handleMessage = (msg) => {
      if (isCompleted) return;
      updateProgressUI(msg);

      if (msg.type === 'completed' && msg.result) {
        isCompleted = true;
        if (eventSource) eventSource.close();
        if (pollInterval) clearInterval(pollInterval);
        currentResult = msg.result;
        setTimeout(() => {
          hideProgressUI();
          renderResults(currentResult);
        }, 500);
      } else if (msg.type === 'error') {
        isCompleted = true;
        if (eventSource) eventSource.close();
        if (pollInterval) clearInterval(pollInterval);
        showToast(msg.message, 'error');
        hideProgressUI();
      }
    };

    eventSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch (err) {}
    };

    // Polling fallback to guarantee real-time updates on Render
    pollInterval = setInterval(async () => {
      if (isCompleted) return;
      try {
        const res = await fetch(`/api/progress-poll/${jobId}`);
        const data = await res.json();
        if (data.history && Array.isArray(data.history)) {
          data.history.forEach(item => handleMessage(item));
        }
      } catch (err) {}
    }, 1200);
  }

  function startProgressUI(title) {
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    progressTitle.innerText = title;
    progressPercent.innerText = '5%';
    progressBarFill.style.width = '5%';
    liveTerminal.innerHTML = '<div class="terminal-line"><span class="term-time">[Init]</span> Task initiated...</div>';
  }

  function updateProgressUI(data) {
    if (data.progress) {
      progressPercent.innerText = `${data.progress}%`;
      progressBarFill.style.width = `${data.progress}%`;
    }
    if (data.message) {
      progressSub.innerText = data.message;
      const line = document.createElement('div');
      line.className = 'terminal-line';
      const time = new Date().toLocaleTimeString().split(' ')[0];
      line.innerHTML = `<span class="term-time">[${time}]</span> ${escapeHtml(data.message)}`;
      liveTerminal.appendChild(line);
      liveTerminal.scrollTop = liveTerminal.scrollHeight;
    }
  }

  function hideProgressUI() {
    progressContainer.classList.add('hidden');
  }

  // Render Verification & Diff Results
  function renderResults(result) {
    resultsContainer.classList.remove('hidden');
    const isCompare = !!result.diffResult;

    // Show/hide Claude badge
    const claudeBadge = document.getElementById('claudeBadge');
    const aiBadgeText = document.getElementById('aiBadgeText');
    if (claudeBadge) {
      if (result.isClaudeUsed) {
        claudeBadge.classList.remove('hidden');
        if (aiBadgeText) {
          if (result.aiProvider === 'openrouter') {
            const modelName = result.openRouterModel ? result.openRouterModel.split('/')[1] || result.openRouterModel : 'OpenRouter';
            aiBadgeText.innerText = `${modelName} Verified`;
          } else {
            aiBadgeText.innerText = 'Claude 3.5 Sonnet Verified';
          }
        }
      } else {
        claudeBadge.classList.add('hidden');
      }
    }

    if (isCompare) {
      const { dataVerification, dataFixPrompts, diffResult } = result;
      const mismatchCount = dataVerification ? dataVerification.totalMismatches : 0;

      bannerTitle.innerText = mismatchCount > 0
        ? `Found ${mismatchCount} Data Inaccuracies in Localhost`
        : 'All Localhost Data Matches Verified Source Perfectly!';

      bannerSubtitle.innerText = 'Generated precision AI prompts to update only incorrect data values in localhost code while preserving all UI styling and colors.';

      bannerStats.innerHTML = `
        <div class="stat-chip">
          <span class="stat-value" style="color: ${mismatchCount > 0 ? 'var(--accent-magenta)' : 'var(--accent-emerald)'};">${mismatchCount}</span>
          <span class="stat-label">Data Inaccuracies</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">${dataFixPrompts ? dataFixPrompts.totalPrompts : 0}</span>
          <span class="stat-label">Data Fix Prompts</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">${diffResult?.summary?.totalSectionsCompared || 0}</span>
          <span class="stat-label">Sections Verified</span>
        </div>
      `;

      // 1. Render Data Fix Prompts (DATA ONLY)
      renderDataFixPrompts(dataFixPrompts, result.aiPrompts);

      // 2. Render Data Inaccuracies Table
      renderDataMismatchesTable(dataVerification?.mismatches || []);

      // 3. Render Visual Viewer with Data Error Markers
      diffViewer.loadDiff(
        result.analysisA.screenshot.urlPath,
        result.analysisB.screenshot.urlPath,
        diffResult.visualDiff.diffUrlPath,
        diffResult.visualDiff,
        dataVerification?.mismatches || []
      );

      // 4. Render Text Diff
      renderTextDiff(diffResult.textDiffChunks);

      // 5. Render Sections Breakdown
      renderSectionDiffs(diffResult.sectionDiffs);

      // 6. Render Theme Color Swatch Comparison
      renderThemeAudit(dataVerification);

      // 7. Render Visual Sidebar Mismatches List
      renderVisualSidebar(dataVerification?.mismatches || []);

      badgeDataFixesCount.innerText = dataFixPrompts?.totalPrompts || 0;
      badgeMismatchesCount.innerText = mismatchCount;

    } else {
      // Single Audit
      const { mainAnalysis, discoveredPages, aiPrompts } = result;
      bannerTitle.innerText = `Website Deep Audit: ${result.url}`;
      bannerSubtitle.innerText = `Analyzed ${discoveredPages.length} internal pages and extracted all data entities.`;

      bannerStats.innerHTML = `
        <div class="stat-chip">
          <span class="stat-value">${discoveredPages.length}</span>
          <span class="stat-label">Pages Crawled</span>
        </div>
        <div class="stat-chip">
          <span class="stat-value">${mainAnalysis.sections.length}</span>
          <span class="stat-label">Sections Analyzed</span>
        </div>
      `;

      renderDataFixPrompts(aiPrompts, null);
      renderSingleSections(mainAnalysis.sections);
      textDiffBox.innerHTML = `<pre>${escapeHtml(mainAnalysis.sections.map(s => s.fullText).join('\n\n'))}</pre>`;
    }

    lucide.createIcons();
    showToast('Data verification completed successfully!', 'success');
  }

  // Render Data Fix AI Prompts (No UI/Color changes)
  function renderDataFixPrompts(dataFixPromptsData, fallbackAiPrompts) {
    dataPromptsList.innerHTML = '';
    const prompts = dataFixPromptsData?.sectionPrompts || fallbackAiPrompts?.sectionPrompts || fallbackAiPrompts?.prompts || [];

    if (prompts.length === 0) {
      dataPromptsList.innerHTML = `
        <div class="prompt-card glass-panel" style="padding: 2.5rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🎉</div>
          <h3 style="color: var(--accent-emerald);">100% Data Accuracy Verified!</h3>
          <p style="color: var(--text-secondary); margin-top: 0.5rem; max-width: 600px; margin-left: auto; margin-right: auto;">
            All product data, pricing, phone numbers, emails, titles, and body content in your localhost match the verified source exactly. No data corrections needed!
          </p>
        </div>
      `;
      return;
    }

    prompts.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'prompt-card';
      card.innerHTML = `
        <div class="prompt-card-header">
          <div class="prompt-card-title">
            <span class="label-badge highlight-pill">Data Correction</span>
            <span>${escapeHtml(p.title || p.sectionName || 'Data Fix')}</span>
            ${p.totalErrors ? `<span class="label-badge badge-purple">${p.totalErrors} value${p.totalErrors > 1 ? 's' : ''} to fix</span>` : ''}
          </div>
          <button class="btn btn-outline btn-sm copy-prompt-btn" data-prompt="${encodeURIComponent(p.prompt)}">
            <i data-lucide="copy"></i> Copy Data Fix Prompt
          </button>
        </div>
        <div class="prompt-card-body">
          <pre class="prompt-code-block">${escapeHtml(p.prompt)}</pre>
        </div>
      `;
      dataPromptsList.appendChild(card);
    });

    // Copy Prompt Buttons
    document.querySelectorAll('.copy-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = decodeURIComponent(btn.dataset.prompt);
        copyToClipboard(text);
        btn.innerHTML = '<i data-lucide="check"></i> Copied!';
        lucide.createIcons();
        setTimeout(() => {
          btn.innerHTML = '<i data-lucide="copy"></i> Copy Data Fix Prompt';
          lucide.createIcons();
        }, 2000);
      });
    });

    // Master Data Prompt Button
    const copyMasterBtn = document.getElementById('copyMasterDataPromptBtn');
    if (copyMasterBtn) {
      copyMasterBtn.onclick = () => {
        const masterText = dataFixPromptsData?.masterDataPrompt || prompts.map(p => p.prompt).join('\n\n---\n\n');
        copyToClipboard(masterText);
        copyMasterBtn.innerHTML = '<i data-lucide="check"></i> Master Prompt Copied!';
        lucide.createIcons();
        setTimeout(() => {
          copyMasterBtn.innerHTML = '<i data-lucide="copy"></i> Copy Master Data Correction Prompt';
          lucide.createIcons();
        }, 2500);
      };
    }
  }

  // Render Data Mismatches Table
  function renderDataMismatchesTable(mismatches = []) {
    dataMismatchesTableBody.innerHTML = '';

    if (mismatches.length === 0) {
      dataMismatchesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--accent-emerald);">
            <i data-lucide="check-circle" style="vertical-align: middle; margin-right: 0.5rem;"></i>
            No data inaccuracies found! All localhost values match the verified source.
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    mismatches.forEach((m, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.category = (m.category || '').toLowerCase();
      tr.innerHTML = `
        <td><strong>${escapeHtml(m.section || 'General Page')}</strong></td>
        <td><span class="label-badge badge-blue">${escapeHtml(m.category)}</span><div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(m.field)}</div></td>
        <td><span class="val-wrong">${escapeHtml(m.localhostValue || 'Missing')}</span></td>
        <td><span class="val-correct">${escapeHtml(m.expectedValue || 'None')}</span></td>
        <td><span class="label-badge ${m.severity === 'HIGH' ? 'badge-purple' : 'badge-cyan'}">${m.severity}</span></td>
        <td>
          <button class="btn btn-outline btn-sm copy-single-item-btn" data-item="${encodeURIComponent(JSON.stringify(m))}">
            <i data-lucide="copy"></i> Prompt
          </button>
        </td>
      `;
      dataMismatchesTableBody.appendChild(tr);
    });

    // Individual Item Prompt Copy
    document.querySelectorAll('.copy-single-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = JSON.parse(decodeURIComponent(btn.dataset.item));
        const singlePrompt = `Please update the "${item.field}" in component \`${item.selector || item.section || 'component'}\`:\nReplace wrong value: "${item.localhostValue}"\nWith correct verified value: "${item.expectedValue}"\n\nDO NOT change any styles or colors.`;
        copyToClipboard(singlePrompt);
        btn.innerHTML = '<i data-lucide="check"></i> Copied';
        lucide.createIcons();
        setTimeout(() => {
          btn.innerHTML = '<i data-lucide="copy"></i> Prompt';
          lucide.createIcons();
        }, 2000);
      });
    });

    lucide.createIcons();
  }

  // Filter Data Mismatches Table
  document.querySelectorAll('.data-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.data-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;

      document.querySelectorAll('#dataMismatchesTableBody tr').forEach(row => {
        const cat = row.dataset.category || '';
        if (filter === 'all') row.classList.remove('hidden');
        else if (filter === 'contact') row.classList.toggle('hidden', !cat.includes('contact') && !cat.includes('email') && !cat.includes('phone'));
        else if (filter === 'pricing') row.classList.toggle('hidden', !cat.includes('price') && !cat.includes('financial'));
        else if (filter === 'headings') row.classList.toggle('hidden', !cat.includes('heading') && !cat.includes('title'));
        else if (filter === 'text') row.classList.toggle('hidden', !cat.includes('text') && !cat.includes('paragraph') && !cat.includes('body'));
      });
    });
  });

  // Render Granular Text Diff
  function renderTextDiff(chunks = []) {
    if (!chunks || chunks.length === 0) {
      textDiffBox.innerHTML = '<p style="color: var(--text-secondary);">No text differences detected.</p>';
      return;
    }
    const html = chunks.map(chunk => {
      if (chunk.added) return `<span class="diff-add">${escapeHtml(chunk.value)}</span>`;
      if (chunk.removed) return `<span class="diff-del">${escapeHtml(chunk.value)}</span>`;
      return `<span>${escapeHtml(chunk.value)}</span>`;
    }).join('');
    textDiffBox.innerHTML = html;
  }

  // Render Section Breakdown
  function renderSectionDiffs(sectionDiffs = []) {
    sectionsGrid.innerHTML = '';
    sectionDiffs.forEach(sec => {
      const card = document.createElement('div');
      card.className = `section-card ${sec.isChanged ? 'changed' : ''}`;
      card.innerHTML = `
        <div class="section-card-header">
          <div class="section-name">${escapeHtml(sec.type)}</div>
          <span class="label-badge ${sec.isChanged ? 'badge-purple' : 'badge-blue'}">
            ${sec.isChanged ? 'Discrepancy' : 'Matched'}
          </span>
        </div>
        <div class="selector-tag">${escapeHtml(sec.selectorB || sec.selectorA || 'section')}</div>
        <div class="diff-subblock">
          <div class="diff-subtitle">Text Snippet</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(sec.secB?.textSnippet || sec.secA?.textSnippet || 'No text')}</p>
        </div>
      `;
      sectionsGrid.appendChild(card);
    });
  }

  function renderSingleSections(sections = []) {
    sectionsGrid.innerHTML = '';
    sections.forEach((sec, idx) => {
      const card = document.createElement('div');
      card.className = 'section-card';
      card.innerHTML = `
        <div class="section-card-header">
          <div class="section-name">#${idx + 1} ${escapeHtml(sec.type)}</div>
          <span class="label-badge badge-cyan">${sec.wordCount} words</span>
        </div>
        <div class="selector-tag">${escapeHtml(sec.selector)}</div>
        <div class="diff-subblock">
          <div class="diff-subtitle">Content Snippet</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(sec.textSnippet || 'No text')}</p>
        </div>
      `;
      sectionsGrid.appendChild(card);
    });
  }

  // Result Tabs Navigation
  document.querySelectorAll('.result-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');

      const targetPane = document.getElementById(`tabPane${capitalize(tab.dataset.tab)}`);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'visual') {
        setTimeout(() => {
          diffViewer.syncDimensions();
          diffViewer.renderVisualMarkers();
        }, 60);
      }
    });
  });

  // Visual View Toolbar Buttons
  document.getElementById('viewSplitBtn')?.addEventListener('click', () => diffViewer.setViewMode('split'));
  document.getElementById('viewSideBySideBtn')?.addEventListener('click', () => diffViewer.setViewMode('sidebyside'));

  // Export
  document.getElementById('exportMarkdownBtn')?.addEventListener('click', () => {
    if (!currentResult?.jobId) return;
    window.location.href = `/api/reports/${currentResult.jobId}/export?format=markdown`;
  });

  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    if (!currentResult?.jobId) return;
    window.location.href = `/api/reports/${currentResult.jobId}/export?format=json`;
  });

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info'}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderThemeAudit(dataVerification) {
    const paletteA = dataVerification.colorPaletteA || { backgrounds: [], texts: [] };
    const paletteB = dataVerification.colorPaletteB || { backgrounds: [], texts: [] };
    
    const bgAList = document.getElementById('paletteBgA');
    const textAList = document.getElementById('paletteTextA');
    const bgBList = document.getElementById('paletteBgB');
    const textBList = document.getElementById('paletteTextB');
    const matchStatusBox = document.getElementById('paletteMatchStatus');
    
    if (!bgAList || !textAList || !bgBList || !textBList || !matchStatusBox) return;
    
    bgAList.innerHTML = '';
    textAList.innerHTML = '';
    bgBList.innerHTML = '';
    textBList.innerHTML = '';
    matchStatusBox.innerHTML = '';
    
    const createSwatchHtml = (color) => {
      const item = document.createElement('div');
      item.className = 'swatch-item';
      item.title = `Click to copy: ${color}`;
      item.innerHTML = `
        <div class="swatch-circle" style="background-color: ${color};"></div>
        <span class="swatch-hex">${color}</span>
      `;
      item.addEventListener('click', () => {
        copyToClipboard(color);
      });
      return item;
    };
    
    if (paletteA.backgrounds && paletteA.backgrounds.length > 0) {
      paletteA.backgrounds.forEach(c => bgAList.appendChild(createSwatchHtml(c)));
    } else {
      bgAList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No background colors detected</span>';
    }
    
    if (paletteA.texts && paletteA.texts.length > 0) {
      paletteA.texts.forEach(c => textAList.appendChild(createSwatchHtml(c)));
    } else {
      textAList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No text colors detected</span>';
    }
    
    if (paletteB.backgrounds && paletteB.backgrounds.length > 0) {
      paletteB.backgrounds.forEach(c => bgBList.appendChild(createSwatchHtml(c)));
    } else {
      bgBList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No background colors detected</span>';
    }
    
    if (paletteB.texts && paletteB.texts.length > 0) {
      paletteB.texts.forEach(c => textBList.appendChild(createSwatchHtml(c)));
    } else {
      textBList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No text colors detected</span>';
    }
    
    const primaryBgA = paletteA.backgrounds?.[0] || '';
    const primaryBgB = paletteB.backgrounds?.[0] || '';
    const primaryTextA = paletteA.texts?.[0] || '';
    const primaryTextB = paletteB.texts?.[0] || '';
    
    const isBgMatch = primaryBgA.toLowerCase() === primaryBgB.toLowerCase();
    const isTextMatch = primaryTextA.toLowerCase() === primaryTextB.toLowerCase();
    
    matchStatusBox.innerHTML = `
      <div class="status-indicator-item ${isBgMatch ? 'match' : 'mismatch'}">
        <span class="status-label">Primary Background</span>
        <span class="status-value">
          <i data-lucide="${isBgMatch ? 'check-circle' : 'alert-triangle'}"></i>
          <span>${isBgMatch ? 'Matches' : 'Mismatch'}</span>
        </span>
      </div>
      <div class="status-indicator-item ${isTextMatch ? 'match' : 'mismatch'}" style="margin-top: 0.5rem;">
        <span class="status-label">Primary Text</span>
        <span class="status-value">
          <i data-lucide="${isTextMatch ? 'check-circle' : 'alert-triangle'}"></i>
          <span>${isTextMatch ? 'Matches' : 'Mismatch'}</span>
        </span>
      </div>
    `;
    
    lucide.createIcons();
  }

  function renderVisualSidebar(mismatches) {
    const list = document.getElementById('visualMismatchesList');
    if (!list) return;
    list.innerHTML = '';
    
    if (!mismatches || mismatches.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 2rem 0;">No discrepancies identified</div>';
      return;
    }
    
    mismatches.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = 'sidebar-error-card';
      card.setAttribute('data-idx', idx);
      card.innerHTML = `
        <div class="error-card-title">
          <span class="error-card-badge">#${idx + 1}</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">${m.category}</span>
        </div>
        <div class="error-card-body" style="font-weight: 600; margin-bottom: 0.3rem;">${escapeHtml(m.field)}</div>
        <div class="error-card-body">${escapeHtml(m.description)}</div>
        <div class="error-card-diff">
          <div style="color: #f87171;">- Site A: "${escapeHtml(m.expectedValue)}"</div>
          <div style="color: #34d399;">+ Site B: "${escapeHtml(m.localhostValue)}"</div>
        </div>
      `;
      
      card.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-error-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        if (window.diffViewer) {
          window.diffViewer.highlightMarker(idx);
        }
      });
      
      list.appendChild(card);
    });
  }

  window.appHighlightErrorCard = (idx) => {
    const cards = document.querySelectorAll('.sidebar-error-card');
    cards.forEach(c => c.classList.remove('active'));
    
    const targetCard = document.querySelector(`.sidebar-error-card[data-idx="${idx}"]`);
    if (targetCard) {
      targetCard.classList.add('active');
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    if (window.diffViewer) {
      const markers = document.querySelectorAll('.visual-error-marker');
      markers.forEach(m => m.classList.remove('active-highlight'));

      const targets = document.querySelectorAll(`.visual-error-marker[data-idx="${idx}"]`);
      targets.forEach(m => m.classList.add('active-highlight'));
    }
  };

  lucide.createIcons();

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
});
