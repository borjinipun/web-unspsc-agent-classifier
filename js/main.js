// main.js
import { els, initUI, appendTrace, renderCard, renderFinalSummary, renderSearchContext, renderError } from './ui.js';
import { loadUNSPSC, isUNSPSCLoaded, getSegments, getFamilies, getClasses, getCommodities } from './unspsc.js';
import { initEngine, isEngineLoaded, classifyLevel, refineSearchContext } from './llm.js';
import { performWebSearch } from './search.js';

// Initialize UI
initUI();

// Load WebLLM & UNSPSC
els.loadModelBtn.addEventListener('click', async () => {
    if (isEngineLoaded()) return;
    
    els.loadModelBtn.disabled = true;
    els.progressContainer.classList.remove('hidden');
    els.statusDot.className = 'status-indicator loading';
    els.statusText.textContent = 'Downloading Model...';
    
    const selectedModel = els.modelSelect.value;
    els.modelSelect.disabled = true;
    
    const engineLoaded = await initEngine(selectedModel);
    
    if (engineLoaded) {
        els.statusDot.className = 'status-indicator ready';
        els.statusText.textContent = 'Model Ready';
        els.progressContainer.classList.add('hidden');
        els.progressText.textContent = '';
        els.loadModelBtn.textContent = 'Model Loaded';
        els.classifyBtn.disabled = false;
        
        if (!isUNSPSCLoaded()) {
            await loadUNSPSC();
        }
    } else {
        els.statusDot.className = 'status-indicator error';
        els.statusText.textContent = 'Error Loading Model';
        els.progressText.textContent = 'Failed to load WebLLM.';
        els.loadModelBtn.disabled = false;
        els.modelSelect.disabled = false;
    }
});

// Classification Logic
els.classifyBtn.addEventListener('click', async () => {
    const partNumber = els.partNumberInput.value.trim();
    const description = els.descriptionInput.value.trim();
    
    if (!partNumber && !description) {
        alert("Please enter a part number or description.");
        return;
    }

    if (!isEngineLoaded() || !isUNSPSCLoaded()) {
        alert("Please load the model and wait for UNSPSC data to initialize.");
        return;
    }

    els.classifyBtn.disabled = true;
    els.classifyBtn.textContent = '⏳ Classifying...';
    els.resultsContainer.innerHTML = '';
    const threshold = parseInt(els.confSlider.value) / 100.0;

    try {
        appendTrace(`Starting classification for: ${partNumber || 'N/A'} - ${description}`);
        
        // 1. Web Search Context
        const query = `${partNumber} ${description}`.trim();
        let searchContext = await performWebSearch(query);
        let refinedContext = "";
        if (searchContext) {
            refinedContext = await refineSearchContext(partNumber, description, searchContext);
            renderSearchContext(query, refinedContext);
        }

        let finalLevel = 0;
        let lastCode = "";
        let lastTitle = "";

        // 2. Level 1 (Segment)
        const segOpts = getSegments();
        appendTrace("Querying L1 Segment...");
        const l1 = await classifyLevel("Segment (Level 1)", segOpts, "", partNumber, description, refinedContext);
        appendTrace(`L1 Result: ${l1.selected_code} (${segOpts[l1.selected_code]}) conf: ${l1.confidence.toFixed(2)}`, "success");
        
        let goL2 = l1.confidence >= threshold;
        renderCard(1, l1.selected_code, segOpts[l1.selected_code], l1.confidence, l1.reasoning, !goL2, l1._debug);
        finalLevel = 1;
        lastCode = l1.selected_code;
        lastTitle = segOpts[l1.selected_code];

        if (!goL2) {
            appendTrace(`Stopping at L1. conf (${l1.confidence.toFixed(2)}) < threshold (${threshold})`);
            renderFinalSummary(lastCode, lastTitle, finalLevel);
            return;
        }

        // 3. Level 2 (Family)
        const famOpts = getFamilies(l1.selected_code);
        if (Object.keys(famOpts).length > 0) {
            appendTrace("Querying L2 Family...");
            const l2 = await classifyLevel("Family (Level 2)", famOpts, `L1 ${l1.selected_code}: ${segOpts[l1.selected_code]}`, partNumber, description, refinedContext);
            appendTrace(`L2 Result: ${l2.selected_code} (${famOpts[l2.selected_code]}) conf: ${l2.confidence.toFixed(2)}`, "success");
            
            let goL3 = l2.confidence >= threshold;
            renderCard(2, l2.selected_code, famOpts[l2.selected_code], l2.confidence, l2.reasoning, !goL3, l2._debug);
            finalLevel = 2;
            lastCode = l2.selected_code;
            lastTitle = famOpts[l2.selected_code];

            if (!goL3) {
                renderFinalSummary(lastCode, lastTitle, finalLevel);
                return;
            }

            // 4. Level 3 (Class)
            const clsOpts = getClasses(l1.selected_code, l2.selected_code);
            if (Object.keys(clsOpts).length > 0) {
                appendTrace("Querying L3 Class...");
                const l3 = await classifyLevel("Class (Level 3)", clsOpts, `L1 ${l1.selected_code} -> L2 ${l2.selected_code}`, partNumber, description, refinedContext);
                appendTrace(`L3 Result: ${l3.selected_code} (${clsOpts[l3.selected_code]}) conf: ${l3.confidence.toFixed(2)}`, "success");
                
                let goL4 = l3.confidence >= threshold;
                renderCard(3, l3.selected_code, clsOpts[l3.selected_code], l3.confidence, l3.reasoning, !goL4, l3._debug);
                finalLevel = 3;
                lastCode = l3.selected_code;
                lastTitle = clsOpts[l3.selected_code];

                if (!goL4) {
                    renderFinalSummary(lastCode, lastTitle, finalLevel);
                    return;
                }

                // 5. Level 4 (Commodity)
                const comOpts = getCommodities(l1.selected_code, l2.selected_code, l3.selected_code);
                if (Object.keys(comOpts).length > 0) {
                    appendTrace("Querying L4 Commodity...");
                    const l4 = await classifyLevel("Commodity (Level 4)", comOpts, `L1 ${l1.selected_code} -> L2 ${l2.selected_code} -> L3 ${l3.selected_code}`, partNumber, description, refinedContext);
                    appendTrace(`L4 Result: ${l4.selected_code} (${comOpts[l4.selected_code]}) conf: ${l4.confidence.toFixed(2)}`, "success");
                    
                    renderCard(4, l4.selected_code, comOpts[l4.selected_code], l4.confidence, l4.reasoning, true, l4._debug);
                    finalLevel = 4;
                    lastCode = l4.selected_code;
                    lastTitle = comOpts[l4.selected_code];
                }
            }
        }
        
        renderFinalSummary(lastCode, lastTitle, finalLevel);
        appendTrace("Classification complete.", "info");

    } catch (e) {
        appendTrace(`Classification error: ${e.message}`, "error");
        renderError(e.message);
    } finally {
        els.classifyBtn.disabled = false;
        els.classifyBtn.innerHTML = '🚀 Classify Part';
    }
});
