const list = document.getElementById("list");
const clearBtn = document.getElementById("clear");
const toastEl = document.getElementById("toast");

let videos = [];
let currentMeta = null;

/* ---------- Toast UX ---------- */
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.style.opacity = 1;
    setTimeout(() => (toastEl.style.opacity = 0), 1300);
}

/* ---------- Helpers ---------- */
async function copyText(t) {
    await navigator.clipboard.writeText(t);
    toast("Copiado");
}

function downloadImage(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
}

/* ---------- Load ---------- */
function loadVideos() {
    chrome.storage.local.get(["videos"], ({ videos: stored = [] }) => {
        videos = stored;
        renderList(videos);

        if (videos.length)
            renderActive(videos[videos.length - 1]);
    });
}

chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "VIDEOS_UPDATED") {
        videos = msg.payload;
        renderList(videos);
        renderActive(videos[videos.length - 1]);
    }
});

/* ---------- PANEL ACTIVO ---------- */
function renderActive(video) {
    if (!video) return;

    currentMeta = video;

    const thumb = video.thumbnails?.maxres || video.thumbnails?.hq || "";
    document.getElementById("thumb-preview").src = thumb;

    document.getElementById("meta-title").textContent = video.title || "";
    document.getElementById("meta-channel").textContent = video.channel?.name || "";
    document.getElementById("meta-date").textContent = video.uploadDate || "";

    document.getElementById("keywords-list").innerHTML =
        (video.keywords || []).map(k => `<span class="kw">${k}</span>`).join("");

    const btn = id => document.getElementById(id);

    //btn("btn-maxres").disabled = !video.thumbnails?.maxres;
    //btn("btn-hq").disabled = !video.thumbnails?.hq;
    btn("btn-copy-meta").disabled = false;
    btn("btn-copy-keywords").disabled = !(video.keywords?.length);
    btn("btn-description").disabled = !video.description;
    btn("btn-tech").disabled = false;

    [
        //"btn-maxres",
        //"btn-hq",
        "btn-copy-meta",
        "btn-copy-keywords",
        "btn-description",
        "btn-tech"
    ].forEach(id => (btn(id).dataset.id = video.videoId));
}

/* ---------- HISTORIAL ---------- */
function renderList(items = []) {
    list.innerHTML = "";

    items.slice().reverse().forEach(video => {
        const el = document.createElement("div");
        el.className = "video";
        el.dataset.id = video.videoId;

        el.innerHTML = `
        <img class="action-select" data-id="${video.videoId}"
            src="${video.thumbnails?.hq || video.thumbnails?.maxres || ""}">
        <div>${video.title}</div>
        `;

        list.appendChild(el);
    });
}

/* ---------- SELECTOR DE VIDEO ---------- */
list.addEventListener("click", e => {
    if (!e.target.classList.contains("action-select")) return;

    const v = videos.find(x => x.videoId === e.target.dataset.id);
    if (v) renderActive(v);

    toast("Cargado en panel principal");
});

/* ---------- ACCIONES GLOBALES ---------- */
document.addEventListener("click", e => {
    const video = videos.find(v => v.videoId === e.target.dataset.id);
    console.log("***** Aquí es EL TARGET", e.target);

    if (!video) return;

    currentMeta = video;

    /*if (e.target.id === "btn-maxres" && video.thumbnails?.maxres) {
        downloadImage(video.thumbnails.maxres, `${video.videoId}_maxres.jpg`);
        toast("Descargado MaxRes");
    }*/
    /*
    if (e.target.id === "btn-hq" && video.thumbnails?.hq) {
        downloadImage(video.thumbnails.hq, `${video.videoId}_hq.jpg`);
        toast("Descargado HQ");
    }*/

    if (e.target.id === "btn-copy-keywords") {
        copyText((video.keywords || []).join(", "));
    }

    if (e.target.id === "btn-copy-meta") {
        copyText((video.keywords || []).join(", "));

    }

    if (e.target.id === "btn-description") {
        alert(video.description || "Sin descripción");
    }

    if (e.target.id === "btn-tech") {
        alert(JSON.stringify(video, null, 2));
    }
});

/* ---------- CLEAR ---------- */
clearBtn.addEventListener("click", () => {
    chrome.storage.local.set({ videos: [] }, loadVideos);
    toast("Historial limpiado");
});

/* ---------- INIT ---------- */
loadVideos();
