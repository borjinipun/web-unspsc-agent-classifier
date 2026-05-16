// search.js
import { appendTrace } from './ui.js';

export async function performWebSearch(query) {
    appendTrace(`Performing web search for: "${query}"...`);
    try {
        // We use DuckDuckGo Lite via a CORS proxy. 
        // If DDG blocks it due to rate limiting, we fallback to a Wikipedia search.
        const encodedQuery = encodeURIComponent(query);
        const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(ddgUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Proxy network error');
        
        const data = await response.json();
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        
        // DuckDuckGo Lite snippet extraction
        const snippets = Array.from(doc.querySelectorAll('.result-snippet'));
        if (snippets.length > 0) {
            const context = snippets.map(el => el.textContent.trim()).join(' | ');
            appendTrace("Web search successful via DuckDuckGo.", "success");
            return context.substring(0, 800); // Limit context size
        }
        
        throw new Error("No DuckDuckGo snippets found, falling back.");
    } catch (e) {
        appendTrace(`DuckDuckGo search failed (${e.message}). Trying Wikipedia fallback...`, "warning");
        return await fallbackWikipediaSearch(query);
    }
}

async function fallbackWikipediaSearch(query) {
    try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const res = await fetch(wikiUrl);
        const data = await res.json();
        
        if (data.query && data.query.search && data.query.search.length > 0) {
            const context = data.query.search.slice(0, 3).map(s => {
                // Strip HTML tags from snippet
                const temp = document.createElement('div');
                temp.innerHTML = s.snippet;
                return temp.textContent || temp.innerText || "";
            }).join(" | ");
            appendTrace("Web search successful via Wikipedia.", "success");
            return context.substring(0, 800);
        }
        appendTrace("Wikipedia search returned no results.", "warning");
        return "";
    } catch(err) {
        appendTrace(`All web searches failed: ${err.message}`, "error");
        return "";
    }
}
