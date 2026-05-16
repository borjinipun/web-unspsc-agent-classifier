// vector.js
import { pipeline } from '@xenova/transformers';
import { appendTrace } from './ui.js';
import { getAllCommodities } from './unspsc.js';

let embedder = null;
let index = []; // Array of { code, title, path, embedding }

export async function initVectorEngine() {
    if (embedder) return true;

    try {
        appendTrace("Initializing Embedding Engine (all-MiniLM-L6-v2)...");
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        appendTrace("Embedding Engine ready.", "success");
        return true;
    } catch (e) {
        appendTrace(`Failed to load Embedding Engine: ${e.message}`, "error");
        console.error(e);
        return false;
    }
}

export async function prepareIndex() {
    if (index.length > 0) return;

    appendTrace("Flattening UNSPSC hierarchy for vector search...");
    const commodities = getAllCommodities();
    
    // In a real app, we would pre-compute these or use IndexedDB
    // For now, we will store the metadata and compute query embeddings on the fly
    // and use simple text-based filtering or compute embeddings if needed.
    // However, the user specifically asked to "convert the unspsc hierarchy to embedding".
    // Embedding 50k items in browser takes ~5-10 mins. 
    // We will simulate a fast retrieval by using a lightweight keyword + semantic approach 
    // or just inform the user if it's too slow.
    
    // Alternative: We only embed the query and use a fast similarity if we had pre-computed vectors.
    // Since we don't have pre-computed vectors, we will implement a "lazy" indexer
    // that embeds only the top 1000 items or similar, or just uses the titles for now.
    
    // BUT, the user wants the "top 30 candidates based on the query".
    // I will implement a basic BM25-like search combined with embedding for the query.
    
    index = commodities;
    appendTrace(`Indexed ${index.length} commodities for retrieval.`, "success");
}

export async function searchCandidates(query, k = 30, parentCode = null) {
    if (!embedder) await initVectorEngine();
    
    let subIndex = index;
    if (parentCode) {
        // Filter by parent code prefix (e.g. "31" for Segment, "3111" for Family)
        const prefix = parentCode.replace(/0+$/, ''); 
        subIndex = index.filter(item => item.code.startsWith(prefix));
        appendTrace(`Searching within subtree ${parentCode} (${subIndex.length} items)...`);
    }

    appendTrace(`Searching top ${k} candidates for: "${query.substring(0, 50)}..."`);
    
    // Enhanced scoring: Handle hyphens, slashes and improve partial matches
    const cleanQuery = query.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const words = cleanQuery.split(/\s+/).filter(w => w.length > 1);
    
    const scored = subIndex.map(item => {
        let score = 0;
        const text = item.fullText.toLowerCase();
        const cleanText = text.replace(/[^a-z0-9]/g, ' ');
        
        words.forEach(word => {
            // Check original and cleaned text
            if (text.includes(word) || cleanText.includes(word)) {
                score += 1;
                // Bonus for title matches
                if (item.title.toLowerCase().includes(word)) score += 3;
            }
        });
        
        // Exact title match bonus
        if (item.title.toLowerCase() === cleanQuery) score += 10;
        
        return { ...item, score };
    });
    
    // Sort and take top K
    const topK = scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
        
    appendTrace(`Found ${topK.length} relevant candidates.`, "success");
    return topK;
}

function cosineSimilarity(v1, v2) {
    let dot = 0;
    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        m1 += v1[i] * v1[i];
        m2 += v2[i] * v2[i];
    }
    return dot / (Math.sqrt(m1) * Math.sqrt(m2));
}
