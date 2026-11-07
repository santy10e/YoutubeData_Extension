/* Popup: panel del video + historial de inspiración. */
(() => {
    "use strict";

    const {
        getVideoIdFromUrl, watchUrl, thumbnailUrls, formatDuration, formatDate, formatNumber,
        formatCompact, formatRelative, buildSummary, safeFilename
    } = window.YTMK;

    const $ = id => document.getElementById(id);
    const CAPTURE_TIMEOUT_MS = 8000;

    /* ---------- Iconos (constantes de confianza) ---------- */
    const ICON_PATHS = {
        copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
        download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
        trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        chevron: '<path d="m9 6 6 6-6 6"/>',
        external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
        play: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        like: '<path d="M7 10v11H3V10z"/><path d="M7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7"/>',
        tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'
    };

    function icon(name) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("class", "icon");
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML = ICON_PATHS[name] || "";
        return svg;
    }

    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (value == null) continue;
            if (key === "class") node.className = value;
            else if (key === "text") node.textContent = value;
            else if (key === "dataset") Object.assign(node.dataset, value);
            else if (key in node) node[key] = value;
            else node.setAttribute(key, value);
        }
        for (const child of [].concat(children)) if (child) node.append(child);
        return node;
    }

    /* ---------- Estado ---------- */
    const state = {
        videos: [],
        tabId: null,
        tabVideoId: null,     // video abierto en la pestaña activa (si es YouTube)
        selectedId: null,     // video elegido desde el historial
        capturing: false,
        captureTimer: null,
        thumbUrl: null,
        query: ""
    };

    const findVideo = id => state.videos.find(v => v.videoId === id) || null;
    const latestVideo = () => state.videos[state.videos.length - 1] || null;

    function displayedVideo() {
        return findVideo(state.selectedId) || findVideo(state.tabVideoId) || latestVideo();
    }

    /* ---------- Toast ---------- */
    let toastTimer = null;

    function toast(message, { action, duration = 1800 } = {}) {
        const box = $("toast");
        const actionBtn = $("toast-action");
        $("toast-text").textContent = message;

        actionBtn.hidden = !action;
        actionBtn.onclick = null;
        if (action) {
            actionBtn.textContent = action.label;
            actionBtn.onclick = () => {
                hideToast();
                action.onClick();
            };
        }

        box.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, action ? 5000 : duration);
    }

    function hideToast() {
        $("toast").classList.remove("is-visible");
    }

    /* ---------- Acciones genéricas ---------- */
    async function copyText(text, message = "Copiado al portapapeles") {
        if (!text) return toast("No hay nada para copiar");
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const area = el("textarea", { value: text });
            document.body.append(area);
            area.select();
            const ok = document.execCommand("copy");
            area.remove();
            if (!ok) return toast("No se pudo copiar");
        }
        toast(message);
    }

    function send(message) {
        return chrome.runtime.sendMessage(message).then(res => {
            if (!res?.ok) throw new Error(res?.error || "Error desconocido");
            return res;
        });
    }

    function downloadBlob(content, filename, type = "application/json") {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const a = el("a", { href: url, download: filename });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Devuelve la primera miniatura que existe (maxresdefault responde con un placeholder de 120px si no existe). */
    function loadFirstValidImage(urls) {
        return new Promise(resolve => {
            const queue = [...new Set(urls.filter(Boolean))];
            const next = () => {
                const url = queue.shift();
                if (!url) return resolve(null);
                const img = new Image();
                img.onload = () => (img.naturalWidth > 120 || !queue.length ? resolve(url) : next());
                img.onerror = next;
                img.src = url;
            };
            next();
        });
    }

    function thumbCandidates(video) {
        const t = video.thumbnails || {};
        const base = thumbnailUrls(video.videoId);
        return [t.maxres || base.maxres, t.best, t.sd || base.sd, t.hq || base.hq, t.fromJsonLd];
    }

    /* ---------- Vistas ---------- */
    function setView(name) {
        const isVideo = name === "video";
        $("tab-video").setAttribute("aria-selected", String(isVideo));
        $("tab-history").setAttribute("aria-selected", String(!isVideo));
        $("tab-video").tabIndex = isVideo ? 0 : -1;
        $("tab-history").tabIndex = isVideo ? -1 : 0;
        $("view-video").hidden = !isVideo;
        $("view-history").hidden = isVideo;
        document.querySelector("main").scrollTop = 0;
    }

    function render() {
        renderVideo();
        renderHistory();
    }

    /* ---------- Panel del video ---------- */
    let renderedVideoKey = null;

    function renderVideo() {
        const video = displayedVideo();
        const waiting = state.capturing && !findVideo(state.tabVideoId) && !state.selectedId;

        $("state-loading").hidden = !waiting;
        $("state-empty").hidden = waiting || Boolean(video);
        $("video-card").hidden = waiting || !video;
        if (waiting || !video) {
            renderedVideoKey = null;
            return;
        }

        renderContext(video);

        // Evita re-render (y parpadeo de la miniatura) si el contenido no cambió.
        const key = `${video.videoId}:${video.lastSeenAt || ""}:${video.source || ""}`;
        if (key === renderedVideoKey) return;
        const sameVideo = renderedVideoKey && renderedVideoKey.startsWith(video.videoId + ":");
        renderedVideoKey = key;

        if (!sameVideo) {
            $("details-description").open = false;
            document.querySelector("main").scrollTop = 0;
            renderThumbnail(video);
        }

        const title = $("video-title");
        title.textContent = video.title || "Sin título";
        title.href = video.url || watchUrl(video.videoId);

        const channel = $("video-channel");
        channel.textContent = video.channel?.name || "Canal desconocido";
        if (video.channel?.url) channel.href = video.channel.url;
        else channel.removeAttribute("href");

        renderStats(video);
        renderKeywords(video);

        $("btn-copy-title").disabled = !video.title;
        $("video-description").textContent = video.description || "Este video no tiene descripción.";
        $("btn-copy-description").disabled = !video.description;
        $("video-json").textContent = JSON.stringify(video, null, 2);
    }

    function renderContext(video) {
        const context = $("video-context");
        context.replaceChildren();
        const isCurrent = video.videoId === state.tabVideoId;
        context.classList.toggle("is-current", isCurrent);

        let text = "Último video capturado";
        if (isCurrent) {
            text = "Video de la pestaña actual";
        } else if (state.selectedId) {
            const seen = formatRelative(video.lastSeenAt || video.capturedAt);
            text = seen ? `Del historial · visto ${seen}` : "Del historial";
        }
        context.append(text);

        if (!isCurrent && state.selectedId && findVideo(state.tabVideoId)) {
            context.append(el("button", {
                type: "button",
                class: "link-btn",
                text: "Volver al actual",
                onclick: () => selectVideo(null)
            }));
        }
    }

    let thumbToken = 0;

    async function renderThumbnail(video) {
        const token = ++thumbToken;
        const img = $("thumb");
        const btn = $("btn-download-thumb");
        img.removeAttribute("src");
        img.alt = `Miniatura de ${video.title || "video"}`;
        btn.disabled = true;
        state.thumbUrl = null;

        $("badge-live").hidden = !video.isLive;
        const duration = video.isLive ? "" : formatDuration(video);
        $("badge-duration").hidden = !duration;
        $("badge-duration").textContent = duration;

        const url = await loadFirstValidImage(thumbCandidates(video));
        if (token !== thumbToken) return;
        if (url) {
            img.src = url;
            state.thumbUrl = url;
            btn.disabled = false;
        }
    }

    function renderStats(video) {
        const items = [];
        if (video.uploadDate) items.push(["calendar", formatDate(video.uploadDate), "Fecha de publicación"]);
        if (typeof video.viewCount === "number") {
            items.push(["eye", `${formatCompact(video.viewCount)} vistas`, `${formatNumber(video.viewCount)} vistas`]);
        }
        if (typeof video.likeCount === "number") {
            items.push(["like", formatCompact(video.likeCount), `${formatNumber(video.likeCount)} me gusta`]);
        }
        if (video.category) items.push(["tag", video.category, "Categoría"]);

        $("video-stats").replaceChildren(
            ...items.map(([iconName, text, title]) => el("li", { title }, [icon(iconName), el("span", { text })]))
        );
    }

    function renderKeywords(video) {
        const keywords = video.keywords || [];
        const box = $("keywords");
        $("kw-count").textContent = keywords.length;
        $("btn-copy-keywords").disabled = !keywords.length;
        $("kw-hint").hidden = !keywords.length;

        if (!keywords.length) {
            const reason = video.source === "dom"
                ? "No se pudieron leer las keywords de este video. Recarga la pestaña para reintentar."
                : "Este video no tiene keywords públicas.";
            box.replaceChildren(el("p", { class: "chips-empty", text: reason }));
            return;
        }

        box.replaceChildren(...keywords.map(k => el("button", {
            type: "button",
            class: "chip",
            text: k,
            title: `Copiar “${k}”`,
            dataset: { keyword: k }
        })));
    }

    /* ---------- Historial ---------- */
    const normalize = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    function matchesQuery(video, query) {
        if (!query) return true;
        const haystack = normalize([video.title, video.channel?.name, ...(video.keywords || [])].join(" "));
        return query.split(/\s+/).every(term => haystack.includes(term));
    }

    function renderHistory() {
        const total = state.videos.length;
        $("history-count").textContent = total;
        $("btn-export").disabled = !total;
        $("btn-clear").disabled = !total;
        $("search").disabled = !total;

        const query = normalize(state.query.trim());
        const items = state.videos.slice().reverse().filter(v => matchesQuery(v, query));
        const shownId = displayedVideo()?.videoId;

        $("history-list").replaceChildren(...items.map(video => historyItem(video, video.videoId === shownId)));

        const empty = $("history-empty");
        empty.hidden = items.length > 0;
        empty.textContent = total
            ? `Sin resultados para “${state.query.trim()}”.`
            : "Tu historial está vacío. Los videos que abras en YouTube se guardarán aquí.";
    }

    function historyItem(video, selected) {
        const t = video.thumbnails || {};
        const duration = video.isLive ? "" : formatDuration(video);
        const metaParts = [video.channel?.name, formatRelative(video.lastSeenAt || video.capturedAt)].filter(Boolean);

        const thumb = el("span", { class: "history-thumb" }, [
            el("img", { src: t.hq || thumbnailUrls(video.videoId).hq, alt: "", loading: "lazy" }),
            duration ? el("span", { class: "badge badge-duration", text: duration }) : null,
            video.isLive ? el("span", { class: "badge badge-live", text: "EN VIVO" }) : null
        ]);

        const main = el("button", {
            type: "button",
            class: "history-main",
            title: "Ver en el panel",
            dataset: { action: "select", id: video.videoId }
        }, [
            thumb,
            el("span", { class: "history-text" }, [
                el("span", { class: "history-title", text: video.title || "Sin título" }),
                el("span", { class: "history-meta", text: metaParts.join(" · ") })
            ])
        ]);

        const open = el("a", {
            class: "icon-btn",
            href: video.url || watchUrl(video.videoId),
            target: "_blank",
            rel: "noopener",
            title: "Abrir en YouTube",
            "aria-label": `Abrir “${video.title || video.videoId}” en YouTube`
        }, icon("external"));

        const remove = el("button", {
            type: "button",
            class: "icon-btn is-danger",
            title: "Eliminar del historial",
            "aria-label": `Eliminar “${video.title || video.videoId}” del historial`,
            dataset: { action: "delete", id: video.videoId }
        }, icon("trash"));

        return el("li", { class: `history-item${selected ? " is-selected" : ""}` }, [
            main,
            el("div", { class: "history-actions" }, [open, remove])
        ]);
    }

    function selectVideo(videoId) {
        state.selectedId = videoId && videoId !== state.tabVideoId ? videoId : null;
        setView("video");
        render();
    }

    async function deleteVideo(videoId) {
        const index = state.videos.findIndex(v => v.videoId === videoId);
        const video = state.videos[index];
        if (!video) return;
        if (state.selectedId === videoId) state.selectedId = null;

        try {
            await send({ type: "DELETE_VIDEO", videoId });
            toast("Video eliminado", {
                action: {
                    label: "Deshacer",
                    onClick: () => send({ type: "RESTORE_VIDEO", video, index })
                        .catch(() => toast("No se pudo restaurar"))
                }
            });
        } catch {
            toast("No se pudo eliminar");
        }
    }

    let clearArmTimer = null;

    async function clearHistory() {
        const btn = $("btn-clear");
        const label = btn.querySelector(".label");

        if (!btn.classList.contains("is-armed")) {
            btn.classList.add("is-armed");
            label.textContent = "¿Seguro? Confirmar";
            clearTimeout(clearArmTimer);
            clearArmTimer = setTimeout(() => {
                btn.classList.remove("is-armed");
                label.textContent = "Limpiar historial";
            }, 3500);
            return;
        }

        clearTimeout(clearArmTimer);
        btn.classList.remove("is-armed");
        label.textContent = "Limpiar historial";
        try {
            await send({ type: "CLEAR_HISTORY" });
            state.selectedId = null;
            state.query = "";
            $("search").value = "";
            toast("Historial limpiado");
        } catch {
            toast("No se pudo limpiar el historial");
        }
    }

    function exportHistory() {
        const date = new Date().toISOString().slice(0, 10);
        downloadBlob(JSON.stringify(state.videos, null, 2), `youtube-metadata-${date}.json`);
        toast(`${state.videos.length} videos exportados`);
    }

    /* ---------- Captura del video de la pestaña activa ---------- */
    async function ensureCurrentTabCaptured() {
        if (!state.tabVideoId || findVideo(state.tabVideoId)) return;

        state.capturing = true;
        renderVideo();
        state.captureTimer = setTimeout(finishCapture, CAPTURE_TIMEOUT_MS);

        let response;
        try {
            response = await chrome.tabs.sendMessage(state.tabId, { type: "CAPTURE_NOW" });
        } catch {
            // Pestaña abierta antes de instalar/recargar la extensión: inyectamos el content script,
            // que captura el video al cargarse.
            try {
                await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ["utils.js", "content.js"] });
            } catch (err) {
                console.debug("No se pudo inyectar el content script", err);
                return finishCapture();
            }
        }
        if (response && !response.ok) finishCapture();
    }

    function finishCapture() {
        clearTimeout(state.captureTimer);
        if (!state.capturing) return;
        state.capturing = false;
        renderVideo();
        if (!findVideo(state.tabVideoId)) {
            toast("No se pudo capturar este video. Recarga la pestaña.", { duration: 4000 });
        }
    }

    /* ---------- Eventos ---------- */
    function bindEvents() {
        $("tab-video").addEventListener("click", () => setView("video"));
        $("tab-history").addEventListener("click", () => setView("history"));
        document.querySelector(".tabs").addEventListener("keydown", e => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            const target = $("tab-video").getAttribute("aria-selected") === "true" ? "history" : "video";
            setView(target);
            $(`tab-${target}`).focus();
        });

        $("keywords").addEventListener("click", e => {
            const chip = e.target.closest(".chip");
            if (!chip) return;
            copyText(chip.dataset.keyword, `“${chip.dataset.keyword}” copiada`);
            chip.classList.add("is-copied");
            setTimeout(() => chip.classList.remove("is-copied"), 900);
        });

        const withVideo = fn => () => {
            const video = displayedVideo();
            if (video) fn(video);
        };

        $("btn-copy-keywords").addEventListener("click", withVideo(v =>
            copyText((v.keywords || []).join(", "), `${v.keywords.length} keywords copiadas`)));
        $("btn-copy-title").addEventListener("click", withVideo(v => copyText(v.title, "Título copiado")));
        $("btn-copy-summary").addEventListener("click", withVideo(v => copyText(buildSummary(v), "Ficha copiada")));
        $("btn-copy-description").addEventListener("click", withVideo(v => copyText(v.description, "Descripción copiada")));
        $("btn-copy-json").addEventListener("click", withVideo(v => copyText(JSON.stringify(v, null, 2), "JSON copiado")));
        $("btn-download-json").addEventListener("click", withVideo(v => {
            downloadBlob(JSON.stringify(v, null, 2), `${safeFilename(v.title)}_${v.videoId}.json`);
        }));

        $("btn-download-thumb").addEventListener("click", withVideo(async v => {
            if (!state.thumbUrl) return;
            const ext = (new URL(state.thumbUrl).pathname.match(/\.(jpe?g|webp|png)$/i) || [, "jpg"])[1];
            try {
                await chrome.downloads.download({
                    url: state.thumbUrl,
                    filename: `${safeFilename(v.title)}_${v.videoId}.${ext}`
                });
                toast("Descargando miniatura");
            } catch {
                toast("No se pudo descargar la miniatura");
            }
        }));

        $("history-list").addEventListener("click", e => {
            const target = e.target.closest("[data-action]");
            if (!target) return;
            if (target.dataset.action === "select") selectVideo(target.dataset.id);
            if (target.dataset.action === "delete") deleteVideo(target.dataset.id);
        });

        $("search").addEventListener("input", e => {
            state.query = e.target.value;
            renderHistory();
        });

        $("btn-export").addEventListener("click", exportHistory);
        $("btn-clear").addEventListener("click", clearHistory);

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !changes.videos) return;
            state.videos = Array.isArray(changes.videos.newValue) ? changes.videos.newValue : [];
            if (state.selectedId && !findVideo(state.selectedId)) state.selectedId = null;
            if (state.capturing && findVideo(state.tabVideoId)) finishCapture();
            render();
        });
    }

    /* ---------- Init ---------- */
    async function init() {
        document.querySelectorAll("[data-icon]").forEach(node => node.replaceChildren(icon(node.dataset.icon)));
        bindEvents();

        const [{ videos = [] }, [tab] = []] = await Promise.all([
            chrome.storage.local.get("videos"),
            chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
        ]);

        state.videos = Array.isArray(videos) ? videos : [];
        if (tab) {
            state.tabId = tab.id;
            state.tabVideoId = getVideoIdFromUrl(tab.url || "");
        }

        render();
        ensureCurrentTabCaptured();
    }

    init();
})();
