const IMGUR_HOSTS = new Set(["imgur.com", "www.imgur.com", "m.imgur.com", "i.imgur.com"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);
const IMGUR_ID_PATTERN = "[A-Za-z0-9]{5,32}";
const MAX_INPUT_LENGTH = 2048;
const MARKDOWN_ENDPOINT = "https://api.github.com/markdown";
const GITHUB_API_VERSION = "2026-03-10";
const RELAY_CACHE_PREFIX = "imgur-portal:camo:";
const EXAMPLE_IMAGE = "https://i.imgur.com/eScxuDz.jpg";
const COPY_BUTTON_LABEL = "copy link";
const INPUT_ERROR_CODES = new Set([
  "missing_url",
  "url_too_long",
  "invalid_scheme",
  "invalid_url",
  "invalid_host",
  "unsafe_url",
  "unsupported_type",
  "unsupported_video",
  "not_direct_image",
  "unsupported_collection",
  "unsupported_path"
]);

export class PortalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PortalError";
    this.code = code;
  }
}

function portalError(code, message) {
  throw new PortalError(code, message);
}

function normalizeExtension(extension) {
  const normalized = extension.toLowerCase();
  return normalized === "gifv" ? "gif" : normalized;
}

function ensureSupportedExtension(extension) {
  const normalized = normalizeExtension(extension);
  if (VIDEO_EXTENSIONS.has(normalized)) {
    portalError(
      "unsupported_video",
      "MP4 and WebM are video formats. GitHub Camo relays images only, so this static portal cannot relay Imgur video through the UK block. A separate video relay is required."
    );
  }
  if (!IMAGE_EXTENSIONS.has(normalized)) {
    portalError(
      "unsupported_type",
      "Only JPEG, PNG, GIF, and WebP images are supported. SVG and other file types are intentionally rejected."
    );
  }
  return normalized;
}

export function normalizeImgurUrl(rawValue) {
  if (typeof rawValue !== "string") {
    portalError("missing_url", "Enter an Imgur image URL.");
  }

  let value = rawValue.trim();
  if (!value) {
    portalError("missing_url", "Enter an Imgur image URL.");
  }
  if (value.length > MAX_INPUT_LENGTH) {
    portalError("url_too_long", "That URL is too long. Use a normal Imgur share or direct-image link.");
  }

  const schemeMatch = value.match(/^([A-Za-z][A-Za-z\d+.-]*):/);
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    portalError("invalid_scheme", "Only HTTP or HTTPS Imgur links are accepted.");
  }

  if (value.startsWith("//")) {
    value = `https:${value}`;
  } else if (!schemeMatch) {
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    portalError("invalid_url", "That does not look like a valid URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!IMGUR_HOSTS.has(host)) {
    portalError("invalid_host", "Use an exact imgur.com or i.imgur.com link. Other hosts are not accepted.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    portalError("invalid_scheme", "Only HTTP or HTTPS Imgur links are accepted.");
  }
  if (parsed.username || parsed.password || parsed.port) {
    portalError("unsafe_url", "Links containing credentials or a custom port are not accepted.");
  }

  const directPattern = new RegExp(`^/(${IMGUR_ID_PATTERN})\\.([A-Za-z0-9]{2,5})/?$`);
  const simplePattern = new RegExp(`^/(${IMGUR_ID_PATTERN})(?:\\.([A-Za-z0-9]{2,5}))?/?$`);
  const downloadPattern = new RegExp(`^/download/(${IMGUR_ID_PATTERN})/?$`, "i");
  let match;
  let id;
  let extension;

  if (host === "i.imgur.com") {
    match = parsed.pathname.match(directPattern);
    if (!match) {
      portalError(
        "not_direct_image",
        "An i.imgur.com link must end with a supported image extension, such as .jpg, .png, or .gif."
      );
    }
    [, id, extension] = match;
    extension = ensureSupportedExtension(extension);
  } else {
    if (/^\/(?:a|gallery|t)\//i.test(parsed.pathname)) {
      portalError(
        "unsupported_collection",
        "Albums and gallery posts are not supported because a static page cannot safely resolve their media list. Use a direct i.imgur.com image link instead."
      );
    }

    match = parsed.pathname.match(simplePattern);
    if (match) {
      [, id, extension = "jpg"] = match;
      extension = ensureSupportedExtension(extension);
    } else {
      match = parsed.pathname.match(downloadPattern);
      if (!match) {
        portalError(
          "unsupported_path",
          "Use a direct i.imgur.com image link or a simple imgur.com image ID. Profiles and other Imgur pages are not supported."
        );
      }
      [, id] = match;
      extension = "jpg";
    }
  }

  const sourceUrl = `https://i.imgur.com/${id}.${extension}`;
  return Object.freeze({
    sourceUrl,
    id,
    extension,
    inputUrl: rawValue.trim(),
    converted: sourceUrl !== rawValue.trim()
  });
}

export function extractSourceFromLocation(locationValue) {
  const href = typeof locationValue === "string" ? locationValue : locationValue?.href;
  if (!href) return null;

  let current;
  try {
    current = new URL(href);
  } catch {
    return null;
  }

  const querySource = current.searchParams.get("url");
  if (querySource) return querySource;

  let hash = current.hash.slice(1);
  if (!hash) return null;
  if (hash.startsWith("?")) hash = hash.slice(1);

  const hashParams = new URLSearchParams(hash);
  const parameterSource = hashParams.get("url");
  if (parameterSource) return parameterSource;

  let decodedHash;
  try {
    decodedHash = decodeURIComponent(hash);
  } catch {
    decodedHash = hash;
  }

  const compactMatch = decodedHash.match(
    new RegExp(`^(${IMGUR_ID_PATTERN})\\.(jpe?g|png|gif|gifv|webp)$`, "i")
  );
  if (compactMatch) {
    return `https://i.imgur.com/${compactMatch[1]}.${normalizeExtension(compactMatch[2])}`;
  }

  return decodedHash;
}

export function buildShareUrl(sourceUrl, locationValue) {
  const normalized = normalizeImgurUrl(sourceUrl);
  const href = typeof locationValue === "string" ? locationValue : locationValue?.href;
  const target = new URL(href);
  target.search = "";
  target.hash = "";
  target.pathname = target.pathname.replace(/\/index\.html$/i, "/");
  target.hash = `${normalized.id}.${normalized.extension}`;
  return target.href;
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function decodeHexUtf8(hexValue) {
  if (!hexValue || hexValue.length % 2 !== 0 || !/^[a-f\d]+$/i.test(hexValue)) return null;
  const bytes = new Uint8Array(hexValue.length / 2);
  for (let index = 0; index < hexValue.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hexValue.slice(index, index + 2), 16);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function extractCamoUrl(renderedHtml, expectedSourceUrl) {
  if (typeof renderedHtml !== "string") {
    portalError("invalid_relay_response", "GitHub returned an unexpected relay response.");
  }

  const imageTag = renderedHtml.match(/<img\b[^>]*>/i)?.[0];
  const sourceAttribute = imageTag?.match(/(?:^|\s)data-canonical-src="([^"]+)"/i)?.[1];
  const srcAttribute = imageTag?.match(/(?:^|\s)src="([^"]+)"/i)?.[1];
  if (!imageTag || !sourceAttribute || !srcAttribute) {
    portalError("invalid_relay_response", "GitHub did not return an image relay URL.");
  }

  const canonicalSource = decodeHtmlAttribute(sourceAttribute);
  if (canonicalSource !== expectedSourceUrl) {
    portalError("relay_mismatch", "GitHub's relay response did not match the requested image.");
  }

  let camoUrl;
  try {
    camoUrl = new URL(decodeHtmlAttribute(srcAttribute));
  } catch {
    portalError("invalid_relay_response", "GitHub returned an invalid relay URL.");
  }

  return validateCamoUrl(camoUrl, expectedSourceUrl);
}

export function validateCamoUrl(camoValue, expectedSourceUrl) {
  let camoUrl;
  try {
    camoUrl = camoValue instanceof URL ? camoValue : new URL(camoValue);
  } catch {
    portalError("invalid_relay_response", "GitHub returned an invalid relay URL.");
  }

  if (camoUrl.protocol !== "https:" || camoUrl.hostname !== "camo.githubusercontent.com") {
    portalError("invalid_relay_host", "GitHub returned an unexpected relay host.");
  }
  if (camoUrl.username || camoUrl.password || camoUrl.port || camoUrl.search || camoUrl.hash) {
    portalError("invalid_relay_response", "GitHub returned an unexpected relay URL shape.");
  }

  const pathMatch = camoUrl.pathname.match(/^\/([a-f\d]{64})\/([a-f\d]+)$/i);
  if (!pathMatch || decodeHexUtf8(pathMatch[2]) !== expectedSourceUrl) {
    portalError("relay_mismatch", "The relay URL did not encode the requested image.");
  }
  return camoUrl.href;
}

export async function requestCamoUrl(
  sourceUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = 12_000, signal } = {}
) {
  if (typeof fetchImpl !== "function") {
    portalError("fetch_unavailable", "This browser cannot contact GitHub's relay service.");
  }

  const normalized = normalizeImgurUrl(sourceUrl);
  if (normalized.sourceUrl !== sourceUrl) {
    portalError("noncanonical_source", "The relay request must use a normalized direct-image URL.");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(MARKDOWN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "text/html",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      },
      body: JSON.stringify({ text: `![image](${sourceUrl})`, mode: "markdown" }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });

    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && rateLimitRemaining === "0")) {
      portalError(
        "relay_rate_limited",
        "GitHub's anonymous API limit has been reached for this connection. Wait for it to reset, or try the direct connection."
      );
    }
    if (response.status === 403) {
      portalError("relay_refused", "GitHub refused the relay request. The API or its policy may have changed.");
    }
    if (!response.ok) {
      portalError("relay_unavailable", `GitHub's relay setup returned HTTP ${response.status}. Try again shortly.`);
    }

    return extractCamoUrl(await response.text(), sourceUrl);
  } catch (error) {
    if (error instanceof PortalError) throw error;
    if (error?.name === "AbortError") {
      portalError("relay_timeout", "GitHub's relay setup took too long. Check the connection and try again.");
    }
    portalError("relay_unavailable", "The browser could not reach GitHub's relay service. Check the connection and try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function getCachedRelay(sourceUrl) {
  try {
    const value = sessionStorage.getItem(`${RELAY_CACHE_PREFIX}${sourceUrl}`);
    if (!value) return null;
    return validateCamoUrl(value, sourceUrl);
  } catch {
    return null;
  }
}

function setCachedRelay(sourceUrl, relayUrl) {
  try {
    sessionStorage.setItem(`${RELAY_CACHE_PREFIX}${sourceUrl}`, relayUrl);
  } catch {
    // The portal works without session storage.
  }
}

function removeCachedRelay(sourceUrl) {
  try {
    sessionStorage.removeItem(`${RELAY_CACHE_PREFIX}${sourceUrl}`);
  } catch {
    // Nothing else is needed.
  }
}

function initializePortal() {
  const elements = {
    form: document.querySelector("#portal-form"),
    input: document.querySelector("#imgur-url"),
    submit: document.querySelector("#submit-button"),
    example: document.querySelector("#example-button"),
    viewer: document.querySelector("#viewer"),
    badge: document.querySelector("#relay-badge"),
    loading: document.querySelector("#loading-panel"),
    loadingSource: document.querySelector("#loading-source"),
    mediaPanel: document.querySelector("#media-panel"),
    mediaImage: document.querySelector("#media-image"),
    imageLink: document.querySelector("#image-link"),
    animationHidden: document.querySelector("#animation-hidden"),
    toggleAnimation: document.querySelector("#toggle-animation"),
    dimensions: document.querySelector("#media-dimensions"),
    canonicalSource: document.querySelector("#canonical-source"),
    shareLink: document.querySelector("#share-link"),
    copyLink: document.querySelector("#copy-link"),
    openRelay: document.querySelector("#open-relay"),
    errorPanel: document.querySelector("#error-panel"),
    errorTitle: document.querySelector("#error-title"),
    errorMessage: document.querySelector("#error-message"),
    retry: document.querySelector("#retry-relay"),
    direct: document.querySelector("#try-direct")
  };

  let activeRequest = 0;
  let currentImage = null;
  let activeAbortController = null;
  let copyResetTimer = null;
  let lastHandledLocation = null;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const canShare = typeof navigator.share === "function";

  elements.shareLink.hidden = !canShare;
  elements.copyLink.classList.toggle("primary-action", !canShare);

  function scrollViewerIntoView() {
    elements.viewer.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function updatePanels(panel) {
    elements.loading.hidden = panel !== "loading";
    elements.mediaPanel.hidden = panel !== "media";
    elements.errorPanel.hidden = panel !== "error";
    elements.viewer.setAttribute("aria-busy", panel === "loading" ? "true" : "false");
  }

  function showLoading(normalized, label = "Preparing relay") {
    elements.viewer.hidden = false;
    updatePanels("loading");
    elements.badge.textContent = label;
    elements.loadingSource.textContent = normalized.sourceUrl;
    elements.mediaImage.removeAttribute("src");
    elements.mediaImage.hidden = false;
    elements.mediaImage.alt = "";
    elements.animationHidden.hidden = true;
    elements.toggleAnimation.hidden = true;
    scrollViewerIntoView();
  }

  function showError(error) {
    elements.viewer.hidden = false;
    updatePanels("error");
    elements.badge.textContent = "Could not load";
    const knownError = error instanceof PortalError;
    elements.errorTitle.textContent =
      error?.code === "unsupported_collection"
        ? "That link contains more than one possible image."
        : error?.code === "unsupported_video"
          ? "That Imgur video cannot be relayed here."
          : "That image could not be relayed.";
    elements.errorMessage.textContent = knownError
      ? error.message
      : "An unexpected error occurred while preparing the image. Try again.";
    elements.input.setAttribute("aria-invalid", INPUT_ERROR_CODES.has(error?.code) ? "true" : "false");
    const hasImage = Boolean(currentImage);
    elements.retry.hidden = !hasImage;
    elements.direct.hidden = !hasImage;
    document.title = "Imgur Portal";
    scrollViewerIntoView();
  }

  function waitForImage(imageUrl, requestId, signal) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        elements.mediaImage.onload = null;
        elements.mediaImage.onerror = null;
        signal?.removeEventListener("abort", handleAbort);
      };
      const handleAbort = () => {
        cleanup();
        const abortError = new Error("Image request was superseded.");
        abortError.name = "AbortError";
        reject(abortError);
      };
      elements.mediaImage.onload = () => {
        if (requestId !== activeRequest) return;
        cleanup();
        resolve();
      };
      elements.mediaImage.onerror = () => {
        if (requestId !== activeRequest) return;
        cleanup();
        reject(new PortalError("image_load_failed", "The relay could not return image bytes. The image may have been removed or the cache may be unavailable."));
      };
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      signal?.addEventListener("abort", handleAbort, { once: true });
      elements.mediaImage.src = imageUrl;
    });
  }

  function setGifVisibility(showGif) {
    elements.mediaImage.hidden = !showGif;
    elements.animationHidden.hidden = showGif;
    elements.toggleAnimation.textContent = showGif ? "hide GIF" : "show GIF";
    elements.imageLink.setAttribute(
      "aria-label",
      showGif
        ? "Open the displayed GIF in a new tab"
        : "Open the hidden GIF in a new tab; it may animate"
    );
  }

  function showMedia(normalized, imageUrl, mode) {
    updatePanels("media");
    elements.badge.textContent = mode === "relay" ? "ready" : "direct Imgur connection";
    elements.mediaImage.alt = `Imgur image ${normalized.id}`;
    elements.dimensions.textContent = `${elements.mediaImage.naturalWidth} × ${elements.mediaImage.naturalHeight} · ${normalized.extension.toUpperCase()}`;
    elements.canonicalSource.textContent = normalized.sourceUrl;
    elements.imageLink.href = imageUrl;
    elements.openRelay.href = imageUrl;
    const isGif = normalized.extension === "gif";
    elements.toggleAnimation.hidden = !isGif;
    if (isGif) {
      setGifVisibility(!reduceMotion);
    } else {
      elements.mediaImage.hidden = false;
      elements.animationHidden.hidden = true;
      elements.imageLink.setAttribute("aria-label", "Open the displayed image in a new tab");
    }
    elements.input.setAttribute("aria-invalid", "false");
    document.title = `${normalized.id}.${normalized.extension} · Imgur Portal`;
  }

  async function displayImage(rawValue, { historyMode = "push", forceRelay = false, direct = false } = {}) {
    const requestId = ++activeRequest;
    activeAbortController?.abort();
    const requestController = new AbortController();
    activeAbortController = requestController;
    let normalized;
    try {
      currentImage = null;
      document.title = "Imgur Portal";
      normalized = normalizeImgurUrl(rawValue);
      currentImage = normalized;
      elements.input.setAttribute("aria-invalid", "false");
      elements.input.value = normalized.sourceUrl;
      const shareUrl = buildShareUrl(normalized.sourceUrl, window.location.href);
      if (historyMode === "replace") {
        history.replaceState(null, "", shareUrl);
        lastHandledLocation = window.location.href;
      } else if (historyMode === "push" && shareUrl !== window.location.href) {
        history.pushState(null, "", shareUrl);
        lastHandledLocation = window.location.href;
      }

      showLoading(normalized, direct ? "Trying direct connection" : "Preparing relay");
      let imageUrl;
      let mode;
      if (direct) {
        imageUrl = normalized.sourceUrl;
        mode = "direct";
      } else {
        if (forceRelay) removeCachedRelay(normalized.sourceUrl);
        imageUrl = getCachedRelay(normalized.sourceUrl);
        if (!imageUrl) {
          imageUrl = await requestCamoUrl(normalized.sourceUrl, { signal: requestController.signal });
          setCachedRelay(normalized.sourceUrl, imageUrl);
        }
        mode = "relay";
      }

      if (requestId !== activeRequest) return;
      await waitForImage(imageUrl, requestId, requestController.signal);
      if (requestId !== activeRequest) return;
      showMedia(normalized, imageUrl, mode);
    } catch (error) {
      if (requestId !== activeRequest) return;
      if (error?.name === "AbortError") return;
      if (error?.code === "image_load_failed" && normalized && !direct) {
        removeCachedRelay(normalized.sourceUrl);
      }
      const displayedError =
        error?.code === "image_load_failed" && normalized?.extension === "gif"
          ? new PortalError(
              "image_load_failed",
              "GitHub's relay could not return this GIF. It may have been removed, or the animation may be larger than GitHub Camo will relay."
            )
          : error;
      showError(displayedError);
    } finally {
      if (requestId === activeRequest) activeAbortController = null;
    }
  }

  async function copyPortalLink() {
    if (!currentImage) return;
    const shareUrl = buildShareUrl(currentImage.sourceUrl, window.location.href);
    clearTimeout(copyResetTimer);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(shareUrl);
      elements.copyLink.textContent = "copied";
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = shareUrl;
      fallback.setAttribute("readonly", "");
      fallback.className = "clipboard-fallback";
      document.body.append(fallback);
      fallback.select();
      let copied = false;
      try {
        copied = typeof document.execCommand === "function" && document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        fallback.remove();
      }
      elements.copyLink.textContent = copied ? "copied" : "copy failed";
    }
    copyResetTimer = setTimeout(() => {
      elements.copyLink.textContent = COPY_BUTTON_LABEL;
    }, 1600);
  }

  async function sharePortalLink() {
    if (!currentImage || !canShare) return;
    const shareUrl = buildShareUrl(currentImage.sourceUrl, window.location.href);
    try {
      await navigator.share({
        title: `Imgur image ${currentImage.id}`,
        url: shareUrl
      });
    } catch (error) {
      if (error?.name !== "AbortError") await copyPortalLink();
    }
  }

  function resetPortal() {
    activeRequest += 1;
    activeAbortController?.abort();
    activeAbortController = null;
    currentImage = null;
    clearTimeout(copyResetTimer);
    elements.copyLink.textContent = COPY_BUTTON_LABEL;
    elements.mediaImage.onload = null;
    elements.mediaImage.onerror = null;
    elements.mediaImage.removeAttribute("src");
    elements.mediaImage.hidden = false;
    elements.mediaImage.alt = "";
    elements.animationHidden.hidden = true;
    elements.toggleAnimation.hidden = true;
    elements.input.value = "";
    elements.input.setAttribute("aria-invalid", "false");
    elements.viewer.setAttribute("aria-busy", "false");
    elements.viewer.hidden = true;
    document.title = "Imgur Portal";
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void displayImage(elements.input.value);
  });
  elements.input.addEventListener("paste", (event) => {
    const pastedValue = event.clipboardData?.getData("text")?.trim();
    if (!pastedValue) return;
    try {
      normalizeImgurUrl(pastedValue);
    } catch {
      return;
    }
    event.preventDefault();
    elements.input.value = pastedValue;
    void displayImage(pastedValue);
  });
  elements.example.addEventListener("click", () => {
    elements.input.value = EXAMPLE_IMAGE;
    void displayImage(EXAMPLE_IMAGE);
  });
  elements.shareLink.addEventListener("click", () => void sharePortalLink());
  elements.copyLink.addEventListener("click", () => void copyPortalLink());
  elements.toggleAnimation.addEventListener("click", () => {
    setGifVisibility(elements.mediaImage.hidden);
  });
  elements.retry.addEventListener("click", () => {
    if (currentImage) void displayImage(currentImage.sourceUrl, { historyMode: "replace", forceRelay: true });
  });
  elements.direct.addEventListener("click", () => {
    if (currentImage) void displayImage(currentImage.sourceUrl, { historyMode: "replace", direct: true });
  });
  function handleLocationChange() {
    if (window.location.href === lastHandledLocation) return;
    lastHandledLocation = window.location.href;
    const source = extractSourceFromLocation(window.location);
    if (source) {
      void displayImage(source, { historyMode: "none" });
    } else {
      resetPortal();
    }
  }

  window.addEventListener("hashchange", handleLocationChange);
  window.addEventListener("popstate", handleLocationChange);

  const initialSource = extractSourceFromLocation(window.location);
  if (initialSource) {
    void displayImage(initialSource, { historyMode: "replace" });
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePortal, { once: true });
  } else {
    initializePortal();
  }
}
