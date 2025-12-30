function safeGet(obj, path, def = null) {
    return path.split(".").reduce((o, k) => (o || {})[k], obj) ?? def;
}

function getJsonLd() {
    const el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return null;

    try {
        return JSON.parse(el.textContent);
    } catch {
        return null;
    }
}
