(() => {
  const root = document.documentElement;
  const grid = document.querySelector('#media-grid');
  const panel = document.querySelector('#gallery-panel');
  const tabs = Array.from(document.querySelectorAll('.gallery-tab'));
  const tiles = Array.from(document.querySelectorAll('.tile'));
  const videos = Array.from(document.querySelectorAll('.tile video'));
  const filterStatus = document.querySelector('#filter-status');
  const viewer = document.querySelector('#project-viewer');
  const visual = document.querySelector('#viewer-visual');
  const closeButton = document.querySelector('.viewer__close');
  const previousButton = document.querySelector('.viewer__previous');
  const nextButton = document.querySelector('.viewer__next');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const supportsViewer = Boolean(viewer && typeof viewer.showModal === 'function');
  const previewTimes = new WeakMap();

  root.classList.add('js-enabled');
  if (supportsViewer) root.classList.add('js-viewer-enabled');

  // Read-only GitHub preview services otherwise load MP4s from GitHub's generic
  // binary MIME. For a commit-pinned preview only, use the same original bytes
  // through a CDN that supplies video/mp4 and range requests. Real hosting stays
  // relative, and never depends on either preview service.
  let previewPath = '';
  if (/^(?:raw|rawcdn)\.githack\.com$/i.test(location.hostname)) {
    previewPath = location.pathname;
  } else if (location.hostname === 'html-preview.github.io') {
    const previewBase = new URL(document.baseURI);
    if (previewBase.hostname === 'raw.githubusercontent.com') previewPath = previewBase.pathname;
  }
  const previewMatch = previewPath.match(/^\/([\w.-]+)\/([\w.-]+)\/([a-f0-9]{40})(?:\/|$)/i);
  if (previewMatch) {
    const previewAssets = `https://cdn.jsdelivr.net/gh/${previewMatch[1]}/${previewMatch[2]}@${previewMatch[3]}/`;
    videos.forEach((video) => {
      const source = video.querySelector('source');
      const path = source && source.getAttribute('src');
      if (path && path.startsWith('assets/media/')) {
        const previewSource = new URL(path, previewAssets).href;
        source.src = previewSource;
        // Some preview wrappers start selecting the original source before this
        // script runs. Reset those videos so playback uses the updated source.
        if (video.currentSrc && video.currentSrc !== previewSource) video.load();
      }
    });
  }

  // Use small grid tracks to keep every original aspect ratio while avoiding
  // large empty gaps between differently shaped pieces.
  let layoutFrame = 0;
  function layoutGrid() {
    layoutFrame = 0;
    grid.classList.add('is-masonry');
    const spacing = window.innerWidth <= 520 ? 14 : 22;
    tiles.forEach((tile) => {
      if (tile.hidden) {
        tile.style.gridRowEnd = '';
        return;
      }
      tile.style.gridRowEnd = `span ${Math.max(1, Math.ceil((tile.offsetHeight + spacing) / 4))}`;
    });
  }
  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutGrid);
  }
  scheduleLayout();
  window.addEventListener('resize', scheduleLayout, { passive: true });
  if ('ResizeObserver' in window) {
    const sizeObserver = new ResizeObserver(scheduleLayout);
    tiles.forEach((tile) => sizeObserver.observe(tile));
  }

  let currentFilter = 'all';
  let filterTimer = 0;
  function applyFilter() {
    const visibleTiles = tiles.filter((tile) => {
      const visible = currentFilter === 'all' || tile.dataset.kind === currentFilter;
      tile.hidden = !visible;
      return visible;
    });
    const count = visibleTiles.length;
    filterStatus.replaceChildren(document.createTextNode(`${count} ${count === 1 ? 'piece' : 'pieces'} `));
    const sparkle = document.createElement('span');
    sparkle.setAttribute('aria-hidden', 'true');
    sparkle.textContent = '✧';
    filterStatus.append(sparkle);
    grid.classList.remove('is-switching');
    scheduleLayout();
  }
  function selectTab(tab) {
    const nextFilter = tab.dataset.filter;
    if (nextFilter === currentFilter && !filterTimer) return;
    currentFilter = nextFilter;
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    window.clearTimeout(filterTimer);
    if (reduceMotion.matches) {
      filterTimer = 0;
      applyFilter();
      return;
    }
    grid.classList.add('is-switching');
    filterTimer = window.setTimeout(() => {
      filterTimer = 0;
      applyFilter();
    }, 140);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let destination;
      if (event.key === 'ArrowRight') destination = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') destination = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[destination].focus();
      selectTab(tabs[destination]);
    });
  });

  // Reveal work gently as it enters view, without altering the source media.
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .06, rootMargin: '0px 0px 60px 0px' });
    root.classList.add('reveal-ready');
    document.querySelectorAll('[data-reveal]').forEach((item) => revealObserver.observe(item));
  }

  function cuePreview(video) {
    if (!supportsViewer || visual.contains(video) || !Number.isFinite(video.duration) || video.duration <= 0) return;
    // Some reels begin with a transition; choose a representative frame when
    // one is specified, otherwise use a moment near the start of the original.
    const chosenTime = Number.parseFloat(video.dataset.previewTime);
    const time = Number.isFinite(chosenTime)
      ? Math.min(chosenTime, Math.max(0, video.duration - .05))
      : Math.min(3, Math.max(.3, video.duration * .12));
    previewTimes.set(video, time);
    try { video.currentTime = time; } catch (_) { /* Controls remain available in the viewer. */ }
  }
  videos.forEach((video) => {
    if (supportsViewer) video.controls = false;
    video.muted = true;
    video.addEventListener('loadedmetadata', () => cuePreview(video));
  });

  // Only load metadata for nearby reels; the full-size originals aren't all
  // requested at once when someone opens the page on a phone.
  if ('IntersectionObserver' in window) {
    const mediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const video = entry.target;
        video.preload = 'metadata';
        if (video.readyState === 0 && video.paused) video.load();
        mediaObserver.unobserve(video);
      });
    }, { rootMargin: '450px 0px' });
    videos.forEach((video) => mediaObserver.observe(video));
  } else {
    videos.forEach((video) => { video.preload = 'metadata'; });
  }

  if (!supportsViewer) return;

  let activeTile = null;
  let returnFocus = null;
  let closeTimer = 0;
  let closing = false;

  function restoreMedia() {
    if (!activeTile) return;
    const media = visual.querySelector('img, video');
    if (media) {
      if (media.tagName === 'VIDEO') {
        media.pause();
        media.muted = true;
        media.controls = false;
      }
      activeTile.querySelector('.tile__media').prepend(media);
      if (media.tagName === 'VIDEO') {
        const time = previewTimes.get(media);
        if (time !== undefined) {
          try { media.currentTime = time; } catch (_) { /* Leave the video paused. */ }
        } else {
          cuePreview(media);
        }
      }
    }
    activeTile = null;
    scheduleLayout();
  }

  function showTile(tile) {
    if (!tile || closing) return;
    const firstOpen = !viewer.open;
    const focusedControl = document.activeElement;
    if (firstOpen) returnFocus = tile.querySelector('.tile__open');
    else restoreMedia();

    const media = tile.querySelector('.tile__media > img, .tile__media > video');
    if (!media) return;
    activeTile = tile;
    visual.append(media);

    const visibleTiles = tiles.filter((item) => !item.hidden);
    const position = visibleTiles.indexOf(tile);
    const kind = tile.dataset.kind === 'reel' ? 'Reel' : 'Post';
    document.querySelector('#viewer-index').textContent = `${tile.dataset.index} / ${kind}`;
    document.querySelector('#viewer-title').textContent = tile.dataset.title;
    document.querySelector('#viewer-detail').textContent = tile.dataset.detail;
    document.querySelector('#viewer-counter').textContent = `${String(position + 1).padStart(2, '0')} / ${String(visibleTiles.length).padStart(2, '0')}`;
    previousButton.disabled = position <= 0;
    nextButton.disabled = position >= visibleTiles.length - 1;

    if (firstOpen) {
      // Set the accessible title before opening the native dialog.
      viewer.showModal();
      document.body.classList.add('viewer-open');
      requestAnimationFrame(() => {
        if (viewer.open && !closing) viewer.classList.add('is-open');
      });
      closeButton.focus();
    } else if (focusedControl === previousButton && previousButton.disabled) {
      nextButton.focus();
    } else if (focusedControl === nextButton && nextButton.disabled) {
      previousButton.focus();
    }

    if (media.tagName === 'VIDEO') {
      media.controls = true;
      media.muted = false;
      try { media.currentTime = 0; } catch (_) { /* Playback starts when metadata is ready. */ }
      const playAttempt = media.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch((error) => {
          if (error.name !== 'AbortError' && activeTile === tile && viewer.open && !closing) {
            document.querySelector('#viewer-detail').textContent = `${tile.dataset.detail} · Use the controls to play`;
          }
        });
      }
    }
  }

  function closeViewer() {
    if (!viewer.open || closing) return;
    closing = true;
    const playingVideo = visual.querySelector('video');
    if (playingVideo) playingVideo.pause();
    viewer.classList.remove('is-open');
    const finish = () => {
      closeTimer = 0;
      if (viewer.open) viewer.close();
    };
    if (reduceMotion.matches) finish();
    else closeTimer = window.setTimeout(finish, 220);
  }

  tiles.forEach((tile) => {
    tile.querySelector('.tile__open').addEventListener('click', () => showTile(tile));
  });
  closeButton.addEventListener('click', closeViewer);
  viewer.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeViewer();
  });
  viewer.addEventListener('close', () => {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    viewer.classList.remove('is-open');
    restoreMedia();
    document.body.classList.remove('viewer-open');
    closing = false;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    returnFocus = null;
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) closeViewer();
  });

  function moveViewer(direction) {
    if (!activeTile || closing) return;
    const visibleTiles = tiles.filter((tile) => !tile.hidden);
    const position = visibleTiles.indexOf(activeTile);
    const destination = visibleTiles[position + direction];
    if (destination) showTile(destination);
  }
  previousButton.addEventListener('click', () => moveViewer(-1));
  nextButton.addEventListener('click', () => moveViewer(1));
  viewer.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'VIDEO') return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveViewer(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveViewer(-1);
    }
  });
})();
