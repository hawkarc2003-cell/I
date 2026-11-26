(() => {
  "use strict";

  // The read-only Git-hosted preview needs a video-friendly MIME type. Prefer
  // jsDelivr there, but it can reject large repositories. In that case try the
  // unchanged GitHub original, and finally a correctly typed Blob of its bytes.
  // The actual site, when hosted normally, always uses its local originals.
  if (window.location.hostname === "html-preview.github.io") {
    const previewUrl = new URL(window.location.href).searchParams.get("url") || "";
    const match = previewUrl.match(/^https:\/\/github\.com\/hawkarc2003-cell\/I\/blob\/([a-f0-9]{40})\/index\.html$/i);

    if (match) {
      const cdnRoot = `https://cdn.jsdelivr.net/gh/hawkarc2003-cell/I@${match[1]}/`;
      const rawRoot = `https://raw.githubusercontent.com/hawkarc2003-cell/I/${match[1]}/`;
      // A previewer can cancel an image request while replacing its document.
      // Retry an unsuccessful original once without changing its bytes.
      document.querySelectorAll("img[src]").forEach((image) => {
        const retryImage = () => {
          if (image.dataset.previewRetried) return;
          const url = new URL(image.currentSrc || image.getAttribute("src"), rawRoot);
          if (url.origin !== "https://raw.githubusercontent.com") return;
          image.dataset.previewRetried = "true";
          url.searchParams.set("preview-retry", "1");
          image.src = url.href;
        };
        image.addEventListener("error", retryImage);
        if (image.complete && image.currentSrc && !image.naturalWidth) retryImage();
      });
      const setHint = (video, message) => {
        if (!video.dataset.inViewer) return;
        const hint = document.getElementById("viewer-hint");
        if (hint) hint.textContent = message;
      };
      const resumeIfOpen = (video) => {
        if (!video.dataset.inViewer) return;
        video.muted = true;
        const playing = video.play();
        if (playing && typeof playing.catch === "function") playing.catch(() => {});
      };
      document.querySelectorAll("video source[src]").forEach((source) => {
        const video = source.parentElement;
        const originalPath = source.getAttribute("src");
        video.dataset.previewCdn = new URL(originalPath, cdnRoot).href;
        video.dataset.previewRaw = new URL(originalPath, rawRoot).href;
        video.dataset.previewStage = "cdn";
        source.src = video.dataset.previewCdn;
        video.dataset.previewSourceUpdated = "true";
        video.addEventListener("loadeddata", () => {
          setHint(video, "Starts muted. Use the controls to adjust sound where available.");
        });
        const handlePreviewError = async () => {
          if (video.dataset.previewStage === "cdn") {
            video.dataset.previewStage = "raw";
            setHint(video, "Loading the original video…");
            source.src = video.dataset.previewRaw;
            video.load();
            resumeIfOpen(video);
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
              resumeIfOpen(video);
            } catch (_) {
              video.dataset.previewStage = "failed";
              setHint(video, "Video could not be loaded. Check your connection and reopen it to retry.");
            }
          } else if (video.dataset.previewStage === "blob") {
            video.dataset.previewStage = "failed";
            setHint(video, "Video could not be loaded. Check your connection and reopen it to retry.");
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

  // Some HTML previewers add a raw-file <base>. Fragment links should still
  // navigate this document, not the source file at that base URL.
  const onPreview = window.location.hostname === "html-preview.github.io";
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
      if (onPreview) navigateToSection(event, link);
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

  // Load only previews near the viewport. Seeking a few selected thumbnails
  // changes the preview frame, never the original file or playback speed.
  const videoPreviews = Array.from(document.querySelectorAll(".project video"));
  const preparePreview = (video) => {
    const previewTime = Number(video.dataset.previewTime || 0);
    if (previewTime > 0) {
      video.addEventListener("loadedmetadata", () => {
        if (!video.dataset.inViewer && video.duration > previewTime) video.currentTime = previewTime;
      }, { once: true });
    }
    if (video.preload === "none" || video.dataset.previewSourceUpdated) {
      delete video.dataset.previewSourceUpdated;
      video.load();
      video.preload = "metadata";
    }
  };
  if ("IntersectionObserver" in window) {
    const previewObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        preparePreview(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "500px 0px" });
    videoPreviews.forEach((video) => previewObserver.observe(video));
  } else {
    videoPreviews.forEach(preparePreview);
  }

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
  const reduced = () => reducedMotion.matches;
  let currentIndex = -1;
  let activeMedia = null;
  let opener = null;
  let closeTimer = null;
  let closing = false;
  let animationFrame = null;

  const returnMedia = () => {
    if (!activeMedia) return;
    const { node, home, project } = activeMedia;
    if (node instanceof HTMLVideoElement) {
      node.pause();
      node.controls = false;
      delete node.dataset.inViewer;
    }
    home.insertBefore(node, home.querySelector(".project__open"));
    project.classList.remove("project--in-viewer");
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
    activeMedia = { node, home, project };
    project.classList.add("project--in-viewer");
    if (node instanceof HTMLVideoElement) {
      node.pause();
      node.controls = true;
      node.dataset.inViewer = "true";
    }
    visual.appendChild(node);
    title.textContent = project.dataset.title;
    detail.textContent = project.dataset.detail;
    const isVideo = node instanceof HTMLVideoElement;
    hint.hidden = !isVideo;
    hint.textContent = isVideo
      ? (node.dataset.previewStage === "fetching" ? "Loading the original video…" : "Starts muted. Use the controls to adjust sound where available.")
      : "";
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
    if (!activeMedia || !(activeMedia.node instanceof HTMLVideoElement)) return;
    // Playback starts from the beginning; visitors can unmute or use the native controls.
    activeMedia.node.muted = true;
    const playing = activeMedia.node.play();
    if (playing && typeof playing.catch === "function") playing.catch(() => {});
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
      videoPreviews.forEach((video) => { video.controls = true; });
      document.documentElement.classList.remove("js-viewer-enabled");
      button.blur();
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

  projects.forEach((project, index) => {
    const button = project.querySelector(".project__open");
    if (button) button.addEventListener("click", () => openProject(index, button));
  });
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
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  });

  videoPreviews.forEach((video) => { video.controls = false; });
  document.documentElement.classList.add("js-viewer-enabled");
})();
