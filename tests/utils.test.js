// Ejecutar con: node --test tests/utils.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../utils.js");

const playerResponse = {
    videoDetails: {
        videoId: "dQw4w9WgXcQ",
        title: "Título con \"comillas\" y {llaves}",
        lengthSeconds: "213",
        keywords: ["rick astley", "never gonna give you up"],
        channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
        shortDescription: "Línea 1\nLínea 2 } {",
        viewCount: "1834537675",
        author: "Rick Astley",
        isLiveContent: false,
        thumbnail: {
            thumbnails: [
                { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", width: 480, height: 360 },
                { url: "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp", width: 1920, height: 1080 }
            ]
        }
    },
    microformat: {
        playerMicroformatRenderer: {
            uploadDate: "2009-10-24T23:57:33-07:00",
            publishDate: "2009-10-24T23:57:33-07:00",
            category: "Music",
            ownerProfileUrl: "http://www.youtube.com/@RickAstleyYT",
            likeCount: "18000000"
        }
    }
};

const html = `<html><script>window.other = {"a":1};</script>
<script nonce="x">var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};var meta = document.createElement('meta');
window.ytplayer.bootstrapPlayerResponse = window['ytInitialPlayerResponse'];</script></html>`;

test("getVideoIdFromUrl soporta watch, shorts, live, embed y youtu.be", () => {
    assert.equal(U.getVideoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"), "dQw4w9WgXcQ");
    assert.equal(U.getVideoIdFromUrl("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
    assert.equal(U.getVideoIdFromUrl("https://www.youtube.com/live/abcdefghijk?si=x"), "abcdefghijk");
    assert.equal(U.getVideoIdFromUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(U.getVideoIdFromUrl("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(U.getVideoIdFromUrl("https://www.youtube.com/"), null);
    assert.equal(U.getVideoIdFromUrl("https://www.youtube.com/watch?v=bad"), null);
    assert.equal(U.getVideoIdFromUrl("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(U.getVideoIdFromUrl("chrome://extensions"), null);
    assert.equal(U.getVideoIdFromUrl(""), null);
});

test("extractJsonAssignment extrae el objeto respetando strings con llaves y comillas", () => {
    assert.deepEqual(U.extractJsonAssignment(html, "ytInitialPlayerResponse"), playerResponse);
    assert.equal(U.extractJsonAssignment("no hay nada", "ytInitialPlayerResponse"), null);
    assert.equal(U.extractJsonAssignment("ytInitialPlayerResponse = {roto", "ytInitialPlayerResponse"), null);
    assert.equal(U.extractJsonAssignment(null, "x"), null);
});

test("metadataFromPlayerResponse construye el modelo completo", () => {
    const meta = U.metadataFromPlayerResponse(playerResponse);
    assert.equal(meta.videoId, "dQw4w9WgXcQ");
    assert.equal(meta.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(meta.title, playerResponse.videoDetails.title);
    assert.equal(meta.description, playerResponse.videoDetails.shortDescription);
    assert.equal(meta.lengthSeconds, 213);
    assert.equal(meta.duration, "PT3M33S");
    assert.equal(meta.viewCount, 1834537675);
    assert.equal(meta.likeCount, 18000000);
    assert.equal(meta.category, "Music");
    assert.equal(meta.channel.name, "Rick Astley");
    assert.equal(meta.channel.url, "https://www.youtube.com/@RickAstleyYT");
    assert.equal(meta.thumbnails.best, "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp");
    assert.deepEqual(meta.keywords, ["rick astley", "never gonna give you up"]);
    assert.equal(U.metadataFromPlayerResponse(null), null);
    assert.equal(U.metadataFromPlayerResponse({}), null);
});

test("metadataFromPlayerResponse tolera campos ausentes (videos sin keywords, directos)", () => {
    const meta = U.metadataFromPlayerResponse({ videoDetails: { videoId: "abcdefghijk", title: "x", isLiveContent: true } });
    assert.deepEqual(meta.keywords, []);
    assert.equal(meta.duration, null);
    assert.equal(meta.isLive, true);
    assert.equal(meta.channel.url, null);
});

test("upsertVideo agrega, mueve al final y no pisa datos con vacíos", () => {
    const a = { videoId: "aaaaaaaaaaa", title: "A", keywords: ["k1"], channel: { name: "C", url: "u" } };
    const b = { videoId: "bbbbbbbbbbb", title: "B", keywords: [] };

    let list = U.upsertVideo([], a, 1);
    list = U.upsertVideo(list, b, 2);
    assert.deepEqual(list.map(v => v.videoId), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);

    // Revisita de A con datos parciales (fallback DOM)
    list = U.upsertVideo(list, { videoId: "aaaaaaaaaaa", title: "A2", keywords: [], channel: { name: null, url: null } }, 3);
    assert.deepEqual(list.map(v => v.videoId), ["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    const updated = list[1];
    assert.equal(updated.title, "A2");
    assert.deepEqual(updated.keywords, ["k1"]);
    assert.deepEqual(updated.channel, { name: "C", url: "u" });
    assert.equal(updated.capturedAt, 1);
    assert.equal(updated.lastSeenAt, 3);
});

test("upsertVideo respeta el límite del historial", () => {
    let list = [];
    for (let i = 0; i < 10; i++) list = U.upsertVideo(list, { videoId: `vid${String(i).padStart(8, "0")}` }, i, 5);
    assert.equal(list.length, 5);
    assert.equal(list[0].videoId, "vid00000005");
});

test("formato de duración, fechas y números", () => {
    assert.equal(U.secondsToIsoDuration(213), "PT3M33S");
    assert.equal(U.secondsToIsoDuration(3600), "PT1H");
    assert.equal(U.secondsToIsoDuration(0), "PT0S");
    assert.equal(U.isoDurationToSeconds("PT1H2M3S"), 3723);
    assert.equal(U.isoDurationToSeconds("P0D"), 0);
    assert.equal(U.isoDurationToSeconds("basura"), null);
    assert.equal(U.formatDuration({ lengthSeconds: 213 }), "3:33");
    assert.equal(U.formatDuration({ lengthSeconds: 3723 }), "1:02:03");
    assert.equal(U.formatDuration({ duration: "PT4M5S" }), "4:05"); // datos legados (JSON-LD)
    assert.equal(U.formatDuration({}), "");
    assert.equal(U.formatDate("2009-10-24T23:57:33-07:00"), "24 oct 2009");
    assert.equal(U.formatDate("2024-01-01"), "1 ene 2024");
    assert.equal(U.formatDate(null), "");
    assert.equal(U.formatDate("no-fecha"), "no-fecha");
    const plain = s => s.replace(/\s/g, " "); // Intl usa espacios no separables
    assert.equal(plain(U.formatCompact(6_118_700_000)), "6,1 mil M");
    assert.equal(plain(U.formatCompact(32_400_000)), "32,4 M");
    assert.equal(U.formatCompact(undefined), "");
    assert.equal(U.formatRelative(1000, 1000 + 30_000), "justo ahora");
    assert.match(U.formatRelative(1_000_000, 1_000_000 + 2 * 86400_000), /2 días|anteayer/);
});

test("buildSummary y safeFilename", () => {
    const meta = U.metadataFromPlayerResponse(playerResponse);
    const summary = U.buildSummary(meta);
    assert.match(summary, /^Título: /);
    assert.match(summary, /Keywords: rick astley, never gonna give you up/);
    assert.match(summary, /Duración: 3:33/);
    assert.equal(U.safeFilename('Canción: "Ñandú" / 2024?'), "Cancion_Nandu_2024");
    assert.equal(U.safeFilename(""), "video");
});
