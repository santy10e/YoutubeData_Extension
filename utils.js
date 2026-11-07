/*
 * Helpers compartidos (sin dependencias del DOM).
 * Se usan desde el content script, el service worker, el popup y los tests de Node.
 */
(function (root) {
    "use strict";

    const MAX_HISTORY = 300;
    const LOCALE = "es-ES";
    const VIDEO_ID_RE = /^[\w-]{11}$/;

    /* ---------- URLs ---------- */

    /** Devuelve el videoId de una URL de YouTube (watch, shorts, live, embed, youtu.be) o null. */
    function getVideoIdFromUrl(href) {
        let url;
        try {
            url = new URL(href);
        } catch {
            return null;
        }

        let id = null;
        if (url.hostname === "youtu.be") {
            id = url.pathname.slice(1).split("/")[0];
        } else if (/(^|\.)youtube\.com$/.test(url.hostname)) {
            if (url.pathname === "/watch") {
                id = url.searchParams.get("v");
            } else {
                const m = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
                if (m) id = m[1];
            }
        }
        return id && VIDEO_ID_RE.test(id) ? id : null;
    }

    function watchUrl(videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    function thumbnailUrls(videoId) {
        return {
            maxres: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            sd: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
            hq: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
    }

    /* ---------- Parser ---------- */

    /**
     * Extrae el objeto JSON asignado a `varName` dentro de código fuente HTML/JS
     * (p. ej. `var ytInitialPlayerResponse = {...};`). Recorre llaves respetando strings.
     */
    function extractJsonAssignment(source, varName) {
        if (typeof source !== "string") return null;
        const re = new RegExp(`${varName}\\s*=\\s*\\{`, "g");
        let match;

        while ((match = re.exec(source))) {
            const start = match.index + match[0].length - 1;
            let depth = 0;
            let inString = false;
            let escaped = false;

            for (let i = start; i < source.length; i++) {
                const c = source[i];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (c === "\\") escaped = true;
                    else if (c === '"') inString = false;
                    continue;
                }
                if (c === '"') inString = true;
                else if (c === "{") depth++;
                else if (c === "}" && --depth === 0) {
                    try {
                        return JSON.parse(source.slice(start, i + 1));
                    } catch {
                        break; // probar con la siguiente coincidencia
                    }
                }
            }
        }
        return null;
    }

    function toInt(value) {
        const n = parseInt(value, 10);
        return Number.isFinite(n) ? n : null;
    }

    function toHttps(url) {
        return typeof url === "string" ? url.replace(/^http:\/\//, "https://") : null;
    }

    /** Convierte `ytInitialPlayerResponse` en el modelo de metadata de la extensión. */
    function metadataFromPlayerResponse(pr) {
        const d = pr && pr.videoDetails;
        if (!d || !d.videoId) return null;

        const mf = (pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
        const id = d.videoId;
        const lengthSeconds = toInt(d.lengthSeconds ?? mf.lengthSeconds);
        const thumbs = ((d.thumbnail && d.thumbnail.thumbnails) || [])
            .filter(t => t && t.url)
            .sort((a, b) => (b.width || 0) - (a.width || 0));

        const channelId = d.channelId || mf.externalChannelId || null;

        return {
            url: watchUrl(id),
            videoId: id,
            title: d.title || (mf.title && mf.title.simpleText) || "",
            description: d.shortDescription || (mf.description && mf.description.simpleText) || "",
            uploadDate: mf.uploadDate || mf.publishDate || null,
            publishDate: mf.publishDate || null,
            duration: lengthSeconds ? secondsToIsoDuration(lengthSeconds) : null,
            lengthSeconds: lengthSeconds || null,
            viewCount: toInt(d.viewCount ?? mf.viewCount),
            likeCount: toInt(mf.likeCount),
            isLive: Boolean(d.isLiveContent),
            channel: {
                name: d.author || mf.ownerChannelName || null,
                id: channelId,
                url: toHttps(mf.ownerProfileUrl) || (channelId ? `https://www.youtube.com/channel/${channelId}` : null)
            },
            thumbnails: {
                ...thumbnailUrls(id),
                best: thumbs.length ? thumbs[0].url : null
            },
            keywords: Array.isArray(d.keywords) ? d.keywords.filter(Boolean) : [],
            category: mf.category || null,
            source: "playerResponse"
        };
    }

    /* ---------- Historial ---------- */

    function isEmpty(value) {
        return value == null || value === "" || (Array.isArray(value) && value.length === 0);
    }

    /** Fusiona metadata nueva sobre la existente sin pisar datos buenos con vacíos. */
    function mergeMeta(prev, next) {
        if (!prev) return { ...next };
        const out = { ...prev };
        for (const [key, value] of Object.entries(next)) {
            if (isEmpty(value)) continue;
            if (value && typeof value === "object" && !Array.isArray(value)) {
                out[key] = mergeMeta(prev[key] && typeof prev[key] === "object" ? prev[key] : null, value);
            } else {
                out[key] = value;
            }
        }
        return out;
    }

    /** Inserta o actualiza un video y lo mueve al final (más reciente). */
    function upsertVideo(list, meta, now = Date.now(), max = MAX_HISTORY) {
        const videos = Array.isArray(list) ? list : [];
        const prev = videos.find(v => v && v.videoId === meta.videoId);
        const merged = mergeMeta(prev, meta);
        merged.capturedAt = (prev && prev.capturedAt) || now;
        merged.lastSeenAt = now;

        const next = videos.filter(v => v && v.videoId !== meta.videoId);
        next.push(merged);
        return next.slice(-max);
    }

    /* ---------- Formato ---------- */

    function secondsToIsoDuration(total) {
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s || (!h && !m) ? s + "S" : ""}`;
    }

    function isoDurationToSeconds(iso) {
        const m = typeof iso === "string" && iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        if (!m) return null;
        const [, d = 0, h = 0, min = 0, s = 0] = m.map(x => (x === undefined ? 0 : x));
        return (+d) * 86400 + (+h) * 3600 + (+min) * 60 + (+s);
    }

    function formatDuration(video) {
        const secs = (video && video.lengthSeconds) || isoDurationToSeconds(video && video.duration);
        if (!secs) return "";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = String(secs % 60).padStart(2, "0");
        return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
    }

    /** Formatea la fecha tal como la publica YouTube (sin desplazarla a la zona horaria local). */
    function formatDate(iso) {
        if (!iso) return "";
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return String(iso);
        const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }

    function formatNumber(n) {
        return typeof n === "number" ? new Intl.NumberFormat(LOCALE).format(n) : "";
    }

    function formatCompact(n) {
        if (typeof n !== "number") return "";
        // En español el formato compacto de Intl no abrevia los miles de millones ("6118,7 M").
        if (n >= 1e9) {
            return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n / 1e9)} mil M`;
        }
        return new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    }

    function formatRelative(timestamp, now = Date.now()) {
        if (!timestamp) return "";
        const diff = (timestamp - now) / 1000;
        const units = [
            ["year", 31536000], ["month", 2592000], ["week", 604800],
            ["day", 86400], ["hour", 3600], ["minute", 60]
        ];
        const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
        for (const [unit, secs] of units) {
            if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
        }
        return "justo ahora";
    }

    /** Ficha de texto plano lista para pegar en notas / documentos. */
    function buildSummary(video) {
        const lines = [
            `Título: ${video.title || "—"}`,
            `Canal: ${(video.channel && video.channel.name) || "—"}`,
            `URL: ${video.url || watchUrl(video.videoId)}`
        ];
        if (video.uploadDate) lines.push(`Publicado: ${formatDate(video.uploadDate)}`);
        const duration = formatDuration(video);
        if (duration) lines.push(`Duración: ${duration}`);
        if (typeof video.viewCount === "number") lines.push(`Vistas: ${formatNumber(video.viewCount)}`);
        if (typeof video.likeCount === "number") lines.push(`Likes: ${formatNumber(video.likeCount)}`);
        if (video.category) lines.push(`Categoría: ${video.category}`);
        lines.push(`Keywords: ${(video.keywords || []).join(", ") || "—"}`);
        return lines.join("\n");
    }

    function safeFilename(text, max = 60) {
        return String(text || "")
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^\w\- ]+/g, "")
            .trim()
            .replace(/\s+/g, "_")
            .slice(0, max) || "video";
    }

    const api = {
        MAX_HISTORY,
        getVideoIdFromUrl,
        watchUrl,
        thumbnailUrls,
        extractJsonAssignment,
        metadataFromPlayerResponse,
        mergeMeta,
        upsertVideo,
        secondsToIsoDuration,
        isoDurationToSeconds,
        formatDuration,
        formatDate,
        formatNumber,
        formatCompact,
        formatRelative,
        buildSummary,
        safeFilename
    };

    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.YTMK = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
