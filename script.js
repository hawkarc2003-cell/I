(() => {
  "use strict";

  // A click can start audio immediately. If a browser blocks playback after an
  // asynchronous preview fallback, expose an explicit "Play with sound" action.
  const playbackAttempts = new WeakMap();
  const attemptPlayback = (video) => {
    const attempt = (playbackAttempts.get(video) || 0) + 1;
    playbackAttempts.set(video, attempt);
    delete video.dataset.playBlocked;
    video.dispatchEvent(new Event("work-media-state"));
    const reportBlocked = (error) => {
      if (!error || error.name !== "NotAllowedError" || playbackAttempts.get(video) !== attempt) return;
      if (video.dataset.inViewer) {
        video.dataset.playBlocked = "true";
        video.dispatchEvent(new Event("work-media-state"));
      } else {
        const status = video.closest(".sample-card")?.querySelector("[data-video-status]");
        if (status) {
          status.textContent = "Tap play on the video to start it.";
          status.hidden = false;
        }
      }
    };
    try {
      const result = video.play();
      if (result && typeof result.catch === "function") result.catch(reportBlocked);
    } catch (error) {
      reportBlocked(error);
    }
  };

  // The read-only Git-hosted preview needs a video-friendly MIME type. Prefer
  // jsDelivr there, but it can reject large repositories. In that case try the
  // unchanged GitHub original, and finally a correctly typed Blob of its bytes.
  // The actual site, when hosted normally, always uses its local originals.
  const onPreview = window.location.hostname === "html-preview.github.io";
  if (onPreview) {
    const previewUrl = new URL(window.location.href).searchParams.get("url") || "";
    const match = previewUrl.match(/^https:\/\/(?:github\.com\/hawkarc2003-cell\/I\/blob\/|raw\.githubusercontent\.com\/hawkarc2003-cell\/I\/)([a-f0-9]{40})\/(?:index|service-(?:pinterest|product-visuals|websites))\.html$/i);

    if (match) {
      const cdnRoot = `https://cdn.jsdelivr.net/gh/hawkarc2003-cell/I@${match[1]}/`;
      const rawRoot = `https://raw.githubusercontent.com/hawkarc2003-cell/I/${match[1]}/`;
      // The previewer rewrites some HTML links but not cross-page fragments.
      // Keep every explicitly marked page link inside this pinned preview.
      document.querySelectorAll("[data-preview-page]").forEach((link) => {
        const page = link.dataset.previewPage;
        if (!/^(?:index|service-(?:pinterest|product-visuals|websites))\.html(?:#[a-z-]+)?$/.test(page)) return;
        const [file, fragment] = page.split("#");
        const source = `https://github.com/hawkarc2003-cell/I/blob/${match[1]}/${file}`;
        link.href = `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(source)}${fragment ? `#${fragment}` : ""}`;
      });
      // Retry interrupted images with a short backoff in this preview only.
      // Each retry points to the same file bytes.
      document.querySelectorAll("img[src]").forEach((image) => {
        const delays = [750, 1500];
        let attempts = 0;
        let pending = false;
        const retryImage = () => {
          if (pending || attempts >= delays.length) return;
          const url = new URL(image.currentSrc || image.getAttribute("src"), rawRoot);
          if (url.origin !== "https://raw.githubusercontent.com") return;
          pending = true;
          window.setTimeout(() => {
            pending = false;
            if (image.naturalWidth) return;
            attempts += 1;
            image.dataset.previewRetried = String(attempts);
            url.searchParams.set("preview-retry", String(attempts));
            image.src = url.href;
          }, delays[attempts]);
        };
        image.addEventListener("error", retryImage);
        if (image.complete && image.currentSrc && !image.naturalWidth) retryImage();
      });
      const setHint = (video, message) => {
        const hint = video.dataset.inViewer
          ? document.getElementById("viewer-hint")
          : video.closest(".sample-card")?.querySelector("[data-video-status]");
        if (!hint) return;
        hint.textContent = message;
        if (!video.dataset.inViewer) hint.hidden = !message;
      };
      const resumeIfRequested = (video) => {
        if (video.dataset.inViewer || video.dataset.previewPlayRequested) attemptPlayback(video);
      };
      const failureMessage = (video) => video.dataset.inViewer
        ? "Video could not be loaded. Check your connection and reopen it to retry."
        : "Video could not be loaded. Check your connection and reload, or open the original video.";
      document.querySelectorAll("video source[src]").forEach((source) => {
        const video = source.parentElement;
        const originalPath = source.getAttribute("src");
        video.dataset.previewCdn = new URL(originalPath, cdnRoot).href;
        video.dataset.previewRaw = new URL(originalPath, rawRoot).href;
        video.dataset.previewStage = "cdn";
        source.src = video.dataset.previewCdn;
        video.dataset.previewSourceUpdated = "true";
        if (video.closest(".sample-card")) {
          // Only resume a service-page clip after the visitor has requested it.
          video.addEventListener("play", () => { video.dataset.previewPlayRequested = "true"; });
          video.addEventListener("pause", () => {
            if (video.readyState >= 2) delete video.dataset.previewPlayRequested;
          });
          video.addEventListener("ended", () => { delete video.dataset.previewPlayRequested; });
        }
        video.addEventListener("loadeddata", () => {
          if (!video.dataset.inViewer) setHint(video, "");
          video.dispatchEvent(new Event("work-media-state"));
        });
        const handlePreviewError = async () => {
          if (video.dataset.previewStage === "cdn") {
            video.dataset.previewStage = "raw";
            setHint(video, "Loading the original video…");
            source.src = video.dataset.previewRaw;
            video.load();
            resumeIfRequested(video);
          } else if (video.dataset.previewStage === "raw") {
            video.dataset.previewStage = "fetching";
            setHint(video, "Loading the original video…");
            try {
              const response = await fetch(video.dataset.previewRaw);
              if (!response.ok) throw new Error("Original video could not be fetched");
              const original = await response.blob();
              if (!original.size) throw new Error("Original video is empty");
              const url = URL.createObjectURL(original.slice(0, original.size, "video/mp4"));
              video.dataset.previewObjectUrl = url;
              video.dataset.previewStage = "blob";
              video.src = url;
              video.load();
              resumeIfRequested(video);
            } catch (_) {
              video.dataset.previewStage = "failed";
              setHint(video, failureMessage(video));
            }
          } else if (video.dataset.previewStage === "blob") {
            video.dataset.previewStage = "failed";
            setHint(video, failureMessage(video));
          }
        };
        // Errors for child <source> elements do not bubble to <video>.
        source.addEventListener("error", handlePreviewError);
        video.addEventListener("error", () => {
          if (video.dataset.previewStage === "blob") handlePreviewError();
        });
      });
      window.addEventListener("pagehide", (event) => {
        if (event.persisted) return;
        document.querySelectorAll("video[data-preview-object-url]").forEach((video) => {
          URL.revokeObjectURL(video.dataset.previewObjectUrl);
        });
      });
    }
  }

  // Prices are filled in by the studio in one small configuration file, not by
  // visitors. Empty fields deliberately retain the "Price on enquiry" text.
  const configuredPrices = window.THEAERALLA_PRICES || {};
  document.querySelectorAll("[data-package-price]").forEach((field) => {
    const price = configuredPrices[field.dataset.service]?.[field.dataset.tier];
    if (typeof price === "string" && price.trim()) field.textContent = price.trim();
  });

  // Restore a section when returning from a separate page in the read-only
  // preview, which replaces its document asynchronously after the initial load.
  if (onPreview && window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "auto", block: "start" }));
  }

  // Some HTML previewers add a raw-file <base>. Fragment links should still
  // navigate this document, not the source file at that base URL.
  const navigateToSection = (event, link) => {
    const href = link.getAttribute("href") || "";
    const destination = new URL(href, document.baseURI);
    // The previewer rewrites fragment links to its own full URL. Ignore links
    // to other pages even if they happen to contain a fragment.
    if (!href.startsWith("#") && (destination.origin !== window.location.origin ||
        destination.pathname !== window.location.pathname || destination.search !== window.location.search)) return;
    const hash = destination.hash;
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (link.classList.contains("skip-link")) target.focus({ preventScroll: true });
    try {
      window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`);
    } catch (_) {
      // Scrolling is sufficient if a hosting environment blocks history changes.
    }
  };

  const menu = document.querySelector(".mobile-menu");
  document.querySelectorAll('a[href*="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      if (menu && menu.contains(link)) menu.open = false;
      const opensFanViewer = link.hasAttribute("data-fan-project") &&
        document.documentElement.classList.contains("js-viewer-enabled");
      if (onPreview && !opensFanViewer) navigateToSection(event, link);
    });
  });
  document.addEventListener("click", (event) => {
    if (menu && menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const revealItems = document.querySelectorAll("[data-reveal]");
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
    document.documentElement.classList.add("reveal-ready");
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  // Fan-shaped work carousel. Its links still lead to the full projects when
  // JavaScript or the native dialog is unavailable.
  const fan = document.querySelector(".work-fan");
  const fanCards = fan ? Array.from(fan.querySelectorAll("[data-fan-project]")) : [];
  let selectFanProject = () => {};
  if (fan && fanCards.length) {
    const fanTrack = fan.querySelector(".work-fan__cards");
    const previous = fan.querySelector("[data-fan-previous]");
    const next = fan.querySelector("[data-fan-next]");
    const toggle = fan.querySelector("[data-fan-toggle]");
    const number = fan.querySelector("[data-fan-number]");
    const announcement = fan.querySelector("[data-fan-announcement]");
    const detailTitle = fan.querySelector("[data-fan-title]");
    const detailType = fan.querySelector("[data-fan-detail]");
    const detailDescription = fan.querySelector("[data-fan-description]");
    const detailOpen = fan.querySelector("[data-fan-open]");
    const detailOpenLabel = fan.querySelector("[data-fan-open-label]");
    const smallFan = window.matchMedia("(max-width: 800px)");
    const fanDialog = document.getElementById("project-viewer");
    let current = Math.min(3, fanCards.length - 1);
    let playing = !reducedMotion.matches;
    let inView = !("IntersectionObserver" in window);
    let pointerOver = false;
    let explicitPlay = false;
    let timer = null;
    let touchStart = null;
    let ignoreTap = false;
    let wheelDistance = 0;
    let wheelReset = null;
    let lastWheelMove = 0;

    const updateToggle = () => {
      toggle.textContent = playing ? "Pause motion" : "Play motion";
      toggle.setAttribute("aria-label", playing ? "Pause motion, stop automatic movement" : "Play motion, start automatic movement");
    };
    const renderFan = (announce = false) => {
      const visibleDistance = smallFan.matches ? 2 : 3;
      const focusedCard = fanCards.includes(document.activeElement) ? document.activeElement : null;
      fanCards.forEach((card, index) => {
        let distance = index - current;
        if (distance > fanCards.length / 2) distance -= fanCards.length;
        if (distance < -fanCards.length / 2) distance += fanCards.length;
        const visible = Math.abs(distance) <= visibleDistance;
        card.dataset.fanPosition = visible ? String(distance) : (distance < 0 ? "outside-left" : "outside-right");
        card.tabIndex = visible ? 0 : -1;
        card.setAttribute("aria-hidden", visible ? "false" : "true");
      });
      // Older browsers without overflow: clip must not retain a hidden scroll offset.
      fanTrack.scrollLeft = 0;
      if (focusedCard && focusedCard.getAttribute("aria-hidden") === "true") {
        fanCards[current].focus({ preventScroll: true });
      }
      number.textContent = String(current + 1).padStart(2, "0");
      const card = fanCards[current];
      const project = document.getElementById(`project-${card.dataset.fanProject}`);
      if (project) {
        const isVideo = Boolean(project.querySelector("video"));
        const action = isVideo ? "Play video" : "View image";
        detailTitle.textContent = project.dataset.title;
        detailType.textContent = project.dataset.detail;
        detailDescription.textContent = project.dataset.description;
        detailOpen.setAttribute("href", card.getAttribute("href"));
        detailOpen.setAttribute("aria-label", `${action}: ${project.dataset.title}`);
        detailOpenLabel.textContent = action;
      }
      if (announce) {
        announcement.textContent = `Work ${current + 1} of ${fanCards.length}: ${project ? project.dataset.title : "Selected project"}.`;
      }
    };
    const canMove = () => playing && inView && !pointerOver &&
      (!fan.contains(document.activeElement) || explicitPlay) &&
      !(fanDialog && fanDialog.open) && document.visibilityState !== "hidden";
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (!canMove()) return;
      timer = window.setTimeout(() => {
        if (canMove()) {
          current = (current + 1) % fanCards.length;
          renderFan();
        }
        schedule();
      }, 7500);
    };
    selectFanProject = (id) => {
      const index = fanCards.findIndex((card) => card.dataset.fanProject === id);
      if (index < 0) return;
      playing = false;
      explicitPlay = false;
      current = index;
      updateToggle();
      renderFan();
      schedule();
    };
    const moveFan = (direction) => {
      playing = false;
      explicitPlay = false;
      current = (current + direction + fanCards.length) % fanCards.length;
      updateToggle();
      renderFan(true);
      schedule();
    };

    fanCards.forEach((card, index) => card.style.setProperty("--fan-delay", `${Math.min(index, 7) * 55}ms`));
    renderFan();
    updateToggle();
    fan.classList.add("is-enhanced");
    previous.addEventListener("click", () => moveFan(-1));
    next.addEventListener("click", () => moveFan(1));
    toggle.addEventListener("click", () => {
      playing = !playing;
      explicitPlay = playing;
      updateToggle();
      schedule();
    });
    fan.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      moveFan(event.key === "ArrowLeft" ? -1 : 1);
    });
    fan.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") { pointerOver = true; schedule(); }
    });
    fan.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") { pointerOver = false; schedule(); }
    });
    fan.addEventListener("focusin", () => { explicitPlay = false; schedule(); });
    fan.addEventListener("focusout", () => window.setTimeout(schedule, 0));
    fan.addEventListener("click", (event) => {
      if (ignoreTap && event.target.closest("[data-fan-project]")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    fanTrack.addEventListener("touchstart", (event) => {
      if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    fanTrack.addEventListener("touchend", (event) => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      ignoreTap = true;
      window.setTimeout(() => { ignoreTap = false; }, 400);
      moveFan(dx < 0 ? 1 : -1);
    }, { passive: true });
    fanTrack.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
    fanTrack.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      wheelDistance += event.deltaX;
      window.clearTimeout(wheelReset);
      wheelReset = window.setTimeout(() => { wheelDistance = 0; }, 180);
      if (Math.abs(wheelDistance) < 45 || Date.now() - lastWheelMove < 650) return;
      moveFan(wheelDistance > 0 ? 1 : -1);
      lastWheelMove = Date.now();
      wheelDistance = 0;
    }, { passive: false });
    const resizeFan = () => { renderFan(); schedule(); };
    if (typeof smallFan.addEventListener === "function") smallFan.addEventListener("change", resizeFan);
    else smallFan.addListener(resizeFan);
    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", (event) => {
        if (event.matches) { playing = false; explicitPlay = false; updateToggle(); }
        schedule();
      });
    }
    document.addEventListener("visibilitychange", schedule);
    if (fanDialog) fanDialog.addEventListener("close", schedule);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        schedule();
      }, { threshold: .15 }).observe(fan);
    }
    schedule();
  }

  // Originals stay out of sight until selected, so they do not load or repeat
  // below the fan. The direct card links remain usable without a dialog.
  const projectVideos = Array.from(document.querySelectorAll(".project video"));
  const dialog = document.getElementById("project-viewer");
  const projects = Array.from(document.querySelectorAll("[data-project]"));
  if (!dialog || typeof dialog.showModal !== "function" || projects.length === 0) return;

  const visual = document.getElementById("viewer-visual");
  const title = document.getElementById("viewer-title");
  const detail = document.getElementById("viewer-detail");
  const hint = document.getElementById("viewer-hint");
  const indexLabel = document.getElementById("viewer-index");
  const counter = document.getElementById("viewer-counter");
  const closeButton = dialog.querySelector(".viewer__close");
  const previousButton = dialog.querySelector(".viewer__previous");
  const nextButton = dialog.querySelector(".viewer__next");
  const soundButton = dialog.querySelector("[data-viewer-sound]");
  const soundLabel = dialog.querySelector("[data-viewer-sound-label]");
  const reduced = () => reducedMotion.matches;
  let currentIndex = -1;
  let activeMedia = null;
  let opener = null;
  let closeTimer = null;
  let closing = false;
  let animationFrame = null;
  let soundEnabled = true;

  const updateSoundUI = () => {
    const video = activeMedia && activeMedia.node instanceof HTMLVideoElement ? activeMedia.node : null;
    soundButton.hidden = !video || video.dataset.hasAudio === "false";
    hint.hidden = !video;
    if (!video) return;
    const failed = video.dataset.previewStage === "failed";
    const loading = video.dataset.previewStage === "fetching" || (video.dataset.previewStage === "raw" && video.readyState < 2);
    if (video.dataset.hasAudio === "false") {
      hint.textContent = failed ? "Video could not be loaded. Check your connection and reopen it to retry."
        : (loading ? "Loading the original video…" : "This original video has no audio track.");
      return;
    }
    const blocked = video.dataset.playBlocked === "true";
    const enabled = !video.muted && video.volume > 0;
    soundLabel.textContent = blocked ? "Play with sound" : (enabled ? "Sound on" : "Sound off");
    soundButton.setAttribute("aria-label", blocked ? "Play with sound" : (enabled ? "Sound on, tap to mute" : "Sound off, tap to turn on"));
    if (blocked) soundButton.removeAttribute("aria-pressed");
    else soundButton.setAttribute("aria-pressed", String(enabled));
    if (failed) {
      hint.textContent = "Video could not be loaded. Check your connection and reopen it to retry.";
    } else if (loading) {
      hint.textContent = "Loading the original video…";
    } else if (blocked) {
      hint.textContent = "Tap Play with sound to start the video.";
    } else {
      hint.textContent = enabled ? "Sound is on. Adjust volume on your device or video." : "Sound is off. Use the sound button to turn it on.";
    }
  };

  projectVideos.forEach((video) => {
    video.addEventListener("volumechange", () => {
      if (activeMedia && activeMedia.node === video && video.dataset.inViewer && video.dataset.hasAudio === "true") {
        soundEnabled = !video.muted && video.volume > 0;
      }
      if (activeMedia && activeMedia.node === video) updateSoundUI();
    });
    video.addEventListener("work-media-state", () => {
      if (activeMedia && activeMedia.node === video) updateSoundUI();
    });
    video.addEventListener("playing", () => {
      delete video.dataset.playBlocked;
      if (activeMedia && activeMedia.node === video) updateSoundUI();
    });
  });

  soundButton.addEventListener("click", () => {
    const video = activeMedia && activeMedia.node;
    if (!(video instanceof HTMLVideoElement) || video.dataset.hasAudio === "false") return;
    if (video.dataset.playBlocked === "true") {
      soundEnabled = true;
      video.muted = false;
      if (video.volume === 0) video.volume = 1;
      attemptPlayback(video);
    } else {
      soundEnabled = video.muted || video.volume === 0;
      video.muted = !soundEnabled;
      if (soundEnabled && video.volume === 0) video.volume = 1;
    }
    updateSoundUI();
  });

  const returnMedia = () => {
    if (!activeMedia) return;
    const { node, home } = activeMedia;
    if (node instanceof HTMLVideoElement) {
      node.pause();
      node.controls = false;
      delete node.dataset.inViewer;
    }
    home.appendChild(node);
    activeMedia = null;
  };

  const displayProject = (index) => {
    if (index < 0 || index >= projects.length) return;
    returnMedia();
    const project = projects[index];
    const home = project.querySelector(".project__media");
    const node = home && home.querySelector("img, video");
    if (!home || !node) return;
    currentIndex = index;
    selectFanProject(project.dataset.index);
    activeMedia = { node, home };
    if (node instanceof HTMLVideoElement) {
      node.pause();
      node.controls = true;
      node.dataset.inViewer = "true";
      if (node.dataset.hasAudio === "true") {
        node.muted = !soundEnabled;
        if (soundEnabled && node.volume === 0) node.volume = 1;
      }
    }
    visual.appendChild(node);
    title.textContent = project.dataset.title;
    detail.textContent = project.dataset.detail;
    const isVideo = node instanceof HTMLVideoElement;
    updateSoundUI();
    dialog.setAttribute("aria-describedby", isVideo ? "viewer-detail viewer-hint" : "viewer-detail");
    indexLabel.textContent = `SELECTED WORK / ${project.dataset.index}`;
    counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}`;
    previousButton.disabled = index === 0;
    nextButton.disabled = index === projects.length - 1;
    if (node instanceof HTMLVideoElement) {
      if (node.dataset.previewStage === "failed") {
        if (node.dataset.previewObjectUrl) URL.revokeObjectURL(node.dataset.previewObjectUrl);
        delete node.dataset.previewObjectUrl;
        node.removeAttribute("src");
        node.querySelector("source").src = node.dataset.previewCdn;
        node.dataset.previewStage = "cdn";
        node.dataset.previewSourceUpdated = "true";
      }
      if (node.dataset.previewSourceUpdated) {
        delete node.dataset.previewSourceUpdated;
        node.load();
        node.preload = "metadata";
      }
      if (node.readyState >= 1) {
        try { node.currentTime = 0; } catch (_) { /* The controls remain usable. */ }
      } else {
        node.addEventListener("loadedmetadata", () => {
          if (node.dataset.inViewer) {
            try { node.currentTime = 0; } catch (_) { /* The controls remain usable. */ }
          }
        }, { once: true });
        node.preload = "metadata";
        node.load();
      }
    }
  };

  const playActiveVideo = () => {
    if (activeMedia && activeMedia.node instanceof HTMLVideoElement) attemptPlayback(activeMedia.node);
  };

  const openProject = (index, button) => {
    if (dialog.open || closing) return;
    opener = button;
    displayProject(index);
    try {
      dialog.showModal();
      document.body.classList.add("viewer-open");
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        dialog.classList.add("is-open");
      });
      closeButton.focus();
      playActiveVideo();
    } catch (_) {
      returnMedia();
      currentIndex = -1;
      projectVideos.forEach((video) => { video.controls = true; });
      document.documentElement.classList.remove("js-viewer-enabled");
      fanCards.forEach((card) => card.removeAttribute("aria-haspopup"));
      const fallback = fan && fan.querySelector("[data-fan-open]");
      if (fallback) fallback.removeAttribute("aria-haspopup");
      button.blur();
      if (button instanceof HTMLAnchorElement) window.location.assign(button.href);
    }
  };

  const finishClosing = () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    if (dialog.open) dialog.close();
  };

  const closeProject = () => {
    if (!dialog.open || closing) return;
    closing = true;
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (activeMedia && activeMedia.node instanceof HTMLVideoElement) activeMedia.node.pause();
    dialog.classList.remove("is-open");
    if (reduced()) finishClosing();
    else closeTimer = window.setTimeout(finishClosing, 220);
  };

  fanCards.forEach((card) => {
    const index = projects.findIndex((project) => project.dataset.index === card.dataset.fanProject);
    if (index < 0) return;
    card.setAttribute("aria-haspopup", "dialog");
    card.addEventListener("click", (event) => {
      if (!document.documentElement.classList.contains("js-viewer-enabled")) return;
      event.preventDefault();
      openProject(index, card);
    });
  });
  const detailOpen = fan && fan.querySelector("[data-fan-open]");
  if (detailOpen) {
    detailOpen.setAttribute("aria-haspopup", "dialog");
    detailOpen.addEventListener("click", (event) => {
      if (!document.documentElement.classList.contains("js-viewer-enabled")) return;
      const card = fan.querySelector('[data-fan-position="0"]');
      const index = card ? projects.findIndex((project) => project.dataset.index === card.dataset.fanProject) : -1;
      if (index < 0) return;
      event.preventDefault();
      openProject(index, detailOpen);
    });
  }
  closeButton.addEventListener("click", closeProject);
  previousButton.addEventListener("click", () => {
    displayProject(currentIndex - 1);
    playActiveVideo();
  });
  nextButton.addEventListener("click", () => {
    displayProject(currentIndex + 1);
    playActiveVideo();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeProject();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeProject();
  });
  dialog.addEventListener("close", () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    closing = false;
    dialog.classList.remove("is-open");
    document.body.classList.remove("viewer-open");
    returnMedia();
    currentIndex = -1;
    const returnFocus = opener && opener.getAttribute("aria-hidden") === "true"
      ? fan.querySelector('[data-fan-position="0"]') : opener;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    opener = null;
  });

  projectVideos.forEach((video) => { video.controls = false; });
  document.documentElement.classList.add("js-viewer-enabled");
})();
