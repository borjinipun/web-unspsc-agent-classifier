// unspsc.js
import { appendTrace } from './ui.js';

let unspscData = null;

export async function loadUNSPSC() {
    try {
        appendTrace("Loading UNSPSC hierarchy...");
        const res = await fetch('data/unspsc.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        unspscData = await res.json();
        appendTrace("UNSPSC hierarchy loaded successfully.", "success");
        return true;
    } catch (e) {
        appendTrace(`Failed to load UNSPSC data: ${e.message}`, "error");
        console.error(e);
        return false;
    }
}

export function isUNSPSCLoaded() {
    return unspscData !== null;
}

export function getSegments() {
    if (!unspscData) return {};
    let res = {};
    for (let seg in unspscData) {
        res[seg] = { title: unspscData[seg].title, definition: unspscData[seg].definition || "" };
    }
    return res;
}

export function getFamilies(segCode) {
    if (!unspscData) return {};
    let res = {};
    const families = unspscData[segCode]?.families || {};
    for (let fam in families) {
        res[fam] = { title: families[fam].title, definition: families[fam].definition || "" };
    }
    return res;
}

export function getClasses(segCode, famCode) {
    if (!unspscData) return {};
    let res = {};
    const classes = unspscData[segCode]?.families[famCode]?.classes || {};
    for (let cls in classes) {
        res[cls] = { title: classes[cls].title, definition: classes[cls].definition || "" };
    }
    return res;
}

export function getCommodities(segCode, famCode, clsCode) {
    if (!unspscData) return {};
    let res = {};
    const commodities = unspscData[segCode]?.families[famCode]?.classes[clsCode]?.commodities || {};
    for (let com in commodities) {
        res[com] = { title: commodities[com].title, definition: commodities[com].definition || "" };
    }
    return res;
}

export function getAllCommodities() {
    if (!unspscData) return [];
    let all = [];
    for (let segCode in unspscData) {
        const seg = unspscData[segCode];
        for (let famCode in seg.families) {
            const fam = seg.families[famCode];
            for (let clsCode in fam.classes) {
                const cls = fam.classes[clsCode];
                for (let comCode in cls.commodities) {
                    const com = cls.commodities[comCode];
                    all.push({
                        code: comCode,
                        title: com.title,
                        definition: com.definition || "",
                        path: `${seg.title} > ${fam.title} > ${cls.title}`,
                        fullText: `${com.title} ${com.definition || ""} ${seg.title} ${fam.title} ${cls.title}`.trim()
                    });
                }
            }
        }
    }
    return all;
}
