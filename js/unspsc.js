// unspsc.js
import { appendTrace } from './ui.js';

let unspscData = null;

export async function loadUNSPSC() {
    try {
        appendTrace("Loading UNSPSC hierarchy...");
        const res = await fetch('unspsc.json');
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
        res[seg] = unspscData[seg].title;
    }
    return res;
}

export function getFamilies(segCode) {
    if (!unspscData) return {};
    let res = {};
    const families = unspscData[segCode]?.families || {};
    for (let fam in families) {
        res[fam] = families[fam].title;
    }
    return res;
}

export function getClasses(segCode, famCode) {
    if (!unspscData) return {};
    let res = {};
    const classes = unspscData[segCode]?.families[famCode]?.classes || {};
    for (let cls in classes) {
        res[cls] = classes[cls].title;
    }
    return res;
}

export function getCommodities(segCode, famCode, clsCode) {
    if (!unspscData) return {};
    let res = {};
    const commodities = unspscData[segCode]?.families[famCode]?.classes[clsCode]?.commodities || {};
    for (let com in commodities) {
        res[com] = commodities[com];
    }
    return res;
}
