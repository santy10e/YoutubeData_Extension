/*
 * Content script: detecta el video abierto en YouTube y envía su metadata al service worker.
 *
 * YouTube es una SPA: al navegar entre videos NO se actualizan el JSON-LD, <meta name="keywords">
 * ni los <script> iniciales. Por eso la metadata se obtiene de `ytInitialPlayerResponse`:
 *   1. del HTML inicial (si corresponde al video actual), o
 *   2. descargando la página /watch del video (navegación SPA), o
 *   3. como último recurso, del DOM ya renderizado (sin keywords).
 */
(() => {
    const isContextValid = () => {
        try {
            return Boolean(chrome.runtime && chrome.runtime.id);
        } catch {
            return false;
        }
    };

    // Evita doble inyección (manifest + chrome.scripting desde el popup) mientras la instancia previa siga viva.
    if (typeof window.__ytmkContentAlive === "function" && window.__ytmkContentAlive()) return;
    window.__ytmkContentAlive = isContextValid;

    const { getVideoIdFromUrl, extractJsonAssignment, metadataFromPlayerResponse, watchUrl, thumbnailUrls } = self.YTMK;

    let lastVideoId = null;
    let controller = null;
    let pollTimer = null;

    /* ---------- Fuentes de metadata ---------- */

    function fromInlineScripts(videoId) {
        for (const script of document.scripts) {
            const text = script.textContent;
            if (!text || !text.includes("ytInitialPlayerResponse")) continue;
            const meta = metadataFromPlayerResponse(extractJsonAssignment(text, "ytInitialPlayerResponse"));
            if (meta && meta.videoId === videoId) return meta;
        }
        return null;
    }

    async function fromNetwork(videoId, signal) {
        const res = await fetch(watchUrl(videoId), { credentials: "include", signal });
        if (!res.ok) return null;
        const meta = metadataFromPlayerResponse(extractJsonAssignment(await res.text(), "ytInitialPlayerResponse"));
        return meta && meta.videoId === videoId ? meta : null;
    }

    function wait(ms, signal) {
        return new Promise(resolve => {
            const t = setTimeout(resolve, ms);
            signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
        });
    }

    /** Fallback: lee el DOM cuando ya corresponde al video actual (sin keywords: el <meta> queda obsoleto). */
    async function fromDom(videoId, signal) {
        for (let i = 0; i < 20 && !signal.aborted; i++) {
            const flexy = document.querySelector("ytd-watch-flexy");
            const domReady = !flexy || flexy.getAttribute("video-id") === videoId;
            const title =
                document.querySelector("ytd-watch-metadata h1 yt-formatted-string")?.textContent?.trim() ||
                document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

            if (domReady && title && title !== "YouTube") {
                const channelLink = document.querySelector("ytd-watch-metadata ytd-channel-name a");
                return {
                    url: watchUrl(videoId),
                    videoId,
                    title,
                    description: "",
                    channel: {
                        name: channelLink?.textContent?.trim() || null,
                        url: channelLink?.href || null
                    },
                    thumbnails: thumbnailUrls(videoId),
                    keywords: [],
                    source: "dom"
                };
            }
            await wait(250, signal);
        }
        return null;
    }

    /* ---------- Captura ---------- */

    async function capture(force = false) {
        if (!isContextValid()) return teardown();

        const videoId = getVideoIdFromUrl(location.href);
        if (!videoId || (!force && videoId === lastVideoId)) return null;
        lastVideoId = videoId;

        controller?.abort();
        controller = new AbortController();
        const { signal } = controller;

        let meta = fromInlineScripts(videoId);
        if (!meta) {
            try {
                meta = await fromNetwork(videoId, signal);
            } catch (err) {
                if (signal.aborted) return null;
                console.debug("[YT Metadata] No se pudo descargar la página del video", err);
            }
        }
        if (!meta && !signal.aborted) meta = await fromDom(videoId, signal);
        if (!meta || signal.aborted) return null;

        try {
            await chrome.runtime.sendMessage({ type: "VIDEO_METADATA", payload: meta });
        } catch (err) {
            if (!isContextValid()) teardown();
            else console.debug("[YT Metadata] No se pudo guardar la metadata", err);
        }
        return meta;
    }

    const onNavigate = () => capture();

    /** La extensión se recargó/actualizó: este script quedó huérfano. */
    function teardown() {
        document.removeEventListener("yt-navigate-finish", onNavigate);
        window.removeEventListener("popstate", onNavigate);
        clearInterval(pollTimer);
        controller?.abort();
        if (window.__ytmkContentAlive === isContextValid) window.__ytmkContentAlive = null;
        return null;
    }

    document.addEventListener("yt-navigate-finish", onNavigate);
    window.addEventListener("popstate", onNavigate);

    // Red de seguridad por si YouTube cambia sus eventos internos: chequeo barato de URL.
    let lastHref = location.href;
    pollTimer = setInterval(() => {
        if (!isContextValid()) return teardown();
        if (location.href !== lastHref) {
            lastHref = location.href;
            capture();
        }
    }, 1000);

    // El popup puede pedir una captura explícita (p. ej. recién instalada la extensión).
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== "CAPTURE_NOW") return;
        capture(true).then(meta => sendResponse({ ok: Boolean(meta), videoId: meta?.videoId || null }));
        return true;
    });

    capture();
})();
