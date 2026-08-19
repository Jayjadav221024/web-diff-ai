/**
 * Interactive Visual Diff Viewer & Swipe Comparison Slider
 * with Robust Visual Markers Rendering
 */
class VisualDiffViewer {
  constructor() {
    this.container = document.getElementById('sliderViewportContainer');
    this.slider = document.getElementById('comparisonSlider');
    this.imgBefore = document.getElementById('imgBefore');
    this.imgAfter = document.getElementById('imgAfter');
    this.overlay = document.getElementById('sliderOverlay');
    this.handle = document.getElementById('sliderHandle');
    this.markersLayer = document.getElementById('visualMarkersLayer');

    this.sideBySideContainer = document.getElementById('sideBySideContainer');
    this.imgSideA = document.getElementById('imgSideA');
    this.imgSideB = document.getElementById('imgSideB');
    this.sideBMarkersLayer = document.getElementById('sideBMarkersLayer');

    this.isDragging = false;
    this.showMarkers = true;
    this.currentMismatches = [];

    this.initEvents();
  }

  initEvents() {
    if (!this.slider) return;

    const onMove = (e) => {
      if (!this.isDragging) return;
      const rect = this.slider.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let offsetX = clientX - rect.left;
      let percentage = (offsetX / rect.width) * 100;

      percentage = Math.max(0, Math.min(100, percentage));

      this.overlay.style.width = `${percentage}%`;
      this.handle.style.left = `${percentage}%`;
    };

    const startDrag = (e) => {
      if (e.target.closest('.visual-error-marker')) return;
      this.isDragging = true;
      onMove(e);
    };

    const stopDrag = () => {
      this.isDragging = false;
    };

    this.slider.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stopDrag);

    this.slider.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', stopDrag);

    this.imgBefore.addEventListener('load', () => {
      this.syncDimensions();
      this.renderVisualMarkers();
    });

    this.imgAfter.addEventListener('load', () => {
      this.syncDimensions();
      this.renderVisualMarkers();
    });

    window.addEventListener('resize', () => {
      this.syncDimensions();
      this.renderVisualMarkers();
    });

    const toggleMarkersBtn = document.getElementById('toggleMarkersBtn');
    toggleMarkersBtn?.addEventListener('click', () => {
      this.showMarkers = !this.showMarkers;
      toggleMarkersBtn.classList.toggle('active', this.showMarkers);
      if (this.markersLayer) this.markersLayer.style.display = this.showMarkers ? 'block' : 'none';
      if (this.sideBMarkersLayer) this.sideBMarkersLayer.style.display = this.showMarkers ? 'block' : 'none';
    });
  }

  syncDimensions() {
    if (!this.imgBefore || !this.imgAfter) return;
    const width = this.imgBefore.clientWidth || this.slider.clientWidth || 1200;
    if (width > 0) {
      this.imgAfter.style.width = `${width}px`;
    }
  }

  loadDiff(siteAUrl, siteBUrl, diffUrl, meta = {}, mismatches = []) {
    this.imgBefore.src = siteAUrl;
    this.imgAfter.src = siteBUrl;
    this.imgSideA.src = siteAUrl;
    this.imgSideB.src = siteBUrl;
    this.currentMismatches = mismatches || [];

    if (this.overlay && this.handle) {
      this.overlay.style.width = '50%';
      this.handle.style.left = '50%';
    }

    setTimeout(() => {
      this.syncDimensions();
      this.renderVisualMarkers();
    }, 200);
  }

  renderVisualMarkers() {
    if (!this.markersLayer) return;
    this.markersLayer.innerHTML = '';
    if (this.sideBMarkersLayer) this.sideBMarkersLayer.innerHTML = '';

    if (!this.currentMismatches || this.currentMismatches.length === 0) return;

    const displayWidth = this.imgBefore.clientWidth || this.slider.clientWidth || 1200;
    const naturalWidth = this.imgBefore.naturalWidth || 1440;
    const scale = naturalWidth > 0 ? (displayWidth / naturalWidth) : 1;

    this.currentMismatches.forEach((m, idx) => {
      const r = m.rect || { x: 30, y: 50 + (idx % 6) * 140, width: 500, height: 70 };
      
      const top = Math.max(5, Math.round(r.y * scale));
      const left = Math.max(5, Math.round(r.x * scale));
      const width = Math.max(80, Math.min(displayWidth - left - 15, Math.round(r.width * scale)));
      const height = Math.max(35, Math.round(r.height * scale));

      const markerEl = document.createElement('div');
      markerEl.className = 'visual-error-marker';
      markerEl.style.top = `${top}px`;
      markerEl.style.left = `${left}px`;
      markerEl.style.width = `${width}px`;
      markerEl.style.height = `${height}px`;
      markerEl.setAttribute('data-idx', idx);

      markerEl.innerHTML = `
        <div class="marker-pin-badge">${idx + 1}</div>
        <div class="marker-tooltip">
          <div class="tooltip-header">
            <span class="badge-tag">Error #${idx + 1}</span>
            <strong>${this.escapeHtml(m.field || m.category)}</strong>
          </div>
          <div class="tooltip-body">
            <div class="tt-row"><span class="tt-lbl wrong">Target Site:</span> "${this.escapeHtml(m.localhostValue)}"</div>
            <div class="tt-row"><span class="tt-lbl correct">Verified Live:</span> "${this.escapeHtml(m.expectedValue)}"</div>
            <div class="tt-loc">📍 ${this.escapeHtml(m.section || 'Page Section')}</div>
          </div>
        </div>
      `;

      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.appHighlightErrorCard) {
          window.appHighlightErrorCard(idx);
        }
      });

      this.markersLayer.appendChild(markerEl);

      if (this.sideBMarkersLayer) {
        const markerElB = markerEl.cloneNode(true);
        markerElB.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.appHighlightErrorCard) {
            window.appHighlightErrorCard(idx);
          }
        });
        this.sideBMarkersLayer.appendChild(markerElB);
      }
    });
  }

  highlightMarker(idx) {
    // Clear active states on all markers
    const markers = document.querySelectorAll('.visual-error-marker');
    markers.forEach(m => m.classList.remove('active-highlight'));

    // Highlight target markers
    const targets = document.querySelectorAll(`.visual-error-marker[data-idx="${idx}"]`);
    targets.forEach(m => m.classList.add('active-highlight'));

    // Smooth scroll target marker into view if it exists
    const target = targets[0];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  setViewMode(mode) {
    document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
    this.container.classList.add('hidden');
    this.sideBySideContainer.classList.add('hidden');

    if (mode === 'split') {
      document.getElementById('viewSplitBtn')?.classList.add('active');
      this.container.classList.remove('hidden');
      setTimeout(() => {
        this.syncDimensions();
        this.renderVisualMarkers();
      }, 50);
    } else if (mode === 'sidebyside') {
      document.getElementById('viewSideBySideBtn')?.classList.add('active');
      this.sideBySideContainer.classList.remove('hidden');
      setTimeout(() => {
        this.renderVisualMarkers();
      }, 50);
    }
  }
}

window.VisualDiffViewer = VisualDiffViewer;
