function getJsonLd() {
    const script = document.querySelector('script[type="application/ld+json"]');
    if (!script) return null;

    try {
        return JSON.parse(script.textContent);
    } catch (e) {
        console.warn("No se pudo parsear JSON-LD", e);
        return null;
    }
}

function safeGet(obj, path, defaultValue = null) {
    return path.split(".").reduce((acc, key) => {
        if (acc && typeof acc === "object" && key in acc) {
            return acc[key];
        }
        return defaultValue;
    }, obj);
}


let lastVideoId = null;

function extractMetadata() {
    const url = location.href;
    const videoId = new URL(url).searchParams.get("v");
    if (!videoId) return;

    if (videoId === lastVideoId) return;
    lastVideoId = videoId;

    const jsonLd = getJsonLd();

    const title = document.querySelector("h1 yt-formatted-string")?.innerText || "";
    const description = document.querySelector("#description")?.innerText || "";

    const meta = {
        url,
        videoId,
        title,
        description,
        uploadDate: jsonLd?.uploadDate || null,
        duration: jsonLd?.duration || null,

        channel: {
            name: jsonLd?.author?.name || null,
            url: jsonLd?.author?.url || null
        },

        thumbnails: {
            maxres: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            hq: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            fromJsonLd: safeGet(jsonLd, "thumbnailUrl.0", null)
        },

        keywords: (
            document.querySelector("meta[name='keywords']")?.content || ""
        ).split(",")
            .map(x => x.trim())
            .filter(x => x.length),

        category: jsonLd?.genre || null
    };

    chrome.storage.local.get(["videos"], ({ videos = [] }) => {
        const exists = videos.find(v => v.videoId === videoId);
        if (exists) return;

        const updated = [...videos, meta];

        chrome.storage.local.set({ videos: updated }, () => {
            chrome.runtime.sendMessage({
                type: "VIDEOS_UPDATED",
                payload: updated
            });
        });
    });
}

const obs = new MutationObserver(extractMetadata);
obs.observe(document.body, { childList: true, subtree: true });

extractMetadata();
