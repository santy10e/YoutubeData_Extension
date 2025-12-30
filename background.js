chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "VIDEO_METADATA") {

        chrome.storage.local.get(["videos"], ({ videos = [] }) => {

            const exists = videos.some(v => v.videoId === msg.payload.videoId);

            if (!exists) {
                videos.push(msg.payload);
                chrome.storage.local.set({ videos });

                chrome.runtime.sendMessage({
                    type: "VIDEOS_UPDATED",
                    payload: videos
                });
            }
        });

    }
});
