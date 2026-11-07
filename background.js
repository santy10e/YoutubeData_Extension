/*
 * Service worker: único punto de escritura del historial en chrome.storage.local.
 * Las escrituras se serializan en una cola para evitar condiciones de carrera
 * cuando hay varias pestañas de YouTube abiertas a la vez.
 */
importScripts("utils.js");

let queue = Promise.resolve();

function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(err => console.error("[YT Metadata] Error al escribir el historial", err));
    return run;
}

async function updateVideos(mutator) {
    const { videos = [] } = await chrome.storage.local.get("videos");
    const next = mutator(Array.isArray(videos) ? videos : []);
    await chrome.storage.local.set({ videos: next });
    return next.length;
}

const handlers = {
    VIDEO_METADATA: ({ payload }) => {
        if (!payload?.videoId) throw new Error("Metadata sin videoId");
        return updateVideos(videos => YTMK.upsertVideo(videos, payload));
    },
    DELETE_VIDEO: ({ videoId }) => updateVideos(videos => videos.filter(v => v.videoId !== videoId)),
    // "Deshacer" de un borrado: reinserta el video en su posición original.
    RESTORE_VIDEO: ({ video, index }) => {
        if (!video?.videoId) throw new Error("Video inválido");
        return updateVideos(videos => {
            const next = videos.filter(v => v.videoId !== video.videoId);
            next.splice(Math.max(0, Math.min(index ?? next.length, next.length)), 0, video);
            return next;
        });
    },
    CLEAR_HISTORY: () => updateVideos(() => [])
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = handlers[msg?.type];
    if (!handler || sender.id !== chrome.runtime.id) return;

    enqueue(() => handler(msg))
        .then(count => sendResponse({ ok: true, count }))
        .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
});
