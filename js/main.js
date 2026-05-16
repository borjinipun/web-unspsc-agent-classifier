// main.js
import { els, initUI, appendTrace, renderCard, renderFinalSummary, renderSearchContext, renderError } from './ui.js';
import { loadUNSPSC, isUNSPSCLoaded, getSegments, getFamilies, getClasses, getCommodities } from './unspsc.js';
import { initEngine, isEngineLoaded, classifyLevel, refineSearchContext } from './llm.js';
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
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

// LangGraph State Definition
const AgentState = Annotation.Root({
    partNumber: Annotation(),
    description: Annotation(),
    threshold: Annotation(),
    refinedContext: Annotation(),
    
    l1Code: Annotation(),
    l1Title: Annotation(),
    l1Conf: Annotation(),
    
    l2Code: Annotation(),
    l2Title: Annotation(),
    l2Conf: Annotation(),
    
    l3Code: Annotation(),
    l3Title: Annotation(),
    l3Conf: Annotation(),
    
    l4Code: Annotation(),
    l4Title: Annotation(),
    l4Conf: Annotation(),
    
    finalLevel: Annotation(),
    lastCode: Annotation(),
    lastTitle: Annotation()
});

// Graph Nodes
async function searchNode(state) {
    const query = `${state.partNumber} ${state.description}`.trim();
    let searchContext = await performWebSearch(query);
    let refinedContext = "";
    if (searchContext) {
        refinedContext = await refineSearchContext(state.partNumber, state.description, searchContext);
        renderSearchContext(query, refinedContext);
    }
    return { refinedContext };
}

async function l1Node(state) {
    const segOpts = getSegments();
    appendTrace("Querying L1 Segment...");
    const l1 = await classifyLevel("Segment (Level 1)", segOpts, "", state.partNumber, state.description, state.refinedContext);
    appendTrace(`L1 Result: ${l1.selected_code} (${segOpts[l1.selected_code]}) conf: ${l1.confidence.toFixed(2)}`, "success");
    
    let goNext = l1.confidence >= state.threshold;
    renderCard(1, l1.selected_code, segOpts[l1.selected_code], l1.confidence, l1.reasoning, !goNext, l1._debug);
    
    return { 
        l1Code: l1.selected_code, 
        l1Title: segOpts[l1.selected_code], 
        l1Conf: l1.confidence,
        finalLevel: 1,
        lastCode: l1.selected_code,
        lastTitle: segOpts[l1.selected_code]
    };
}

async function l2Node(state) {
    const famOpts = getFamilies(state.l1Code);
    appendTrace("Querying L2 Family...");
    const l2 = await classifyLevel("Family (Level 2)", famOpts, `L1 ${state.l1Code}: ${state.l1Title}`, state.partNumber, state.description, state.refinedContext);
    appendTrace(`L2 Result: ${l2.selected_code} (${famOpts[l2.selected_code]}) conf: ${l2.confidence.toFixed(2)}`, "success");
    
    let goNext = l2.confidence >= state.threshold;
    renderCard(2, l2.selected_code, famOpts[l2.selected_code], l2.confidence, l2.reasoning, !goNext, l2._debug);
    
    return {
        l2Code: l2.selected_code,
        l2Title: famOpts[l2.selected_code],
        l2Conf: l2.confidence,
        finalLevel: 2,
        lastCode: l2.selected_code,
        lastTitle: famOpts[l2.selected_code]
    };
}

async function l3Node(state) {
    const clsOpts = getClasses(state.l1Code, state.l2Code);
    appendTrace("Querying L3 Class...");
    const l3 = await classifyLevel("Class (Level 3)", clsOpts, `L1 ${state.l1Code} -> L2 ${state.l2Code}`, state.partNumber, state.description, state.refinedContext);
    appendTrace(`L3 Result: ${l3.selected_code} (${clsOpts[l3.selected_code]}) conf: ${l3.confidence.toFixed(2)}`, "success");
    
    let goNext = l3.confidence >= state.threshold;
    renderCard(3, l3.selected_code, clsOpts[l3.selected_code], l3.confidence, l3.reasoning, !goNext, l3._debug);
    
    return {
        l3Code: l3.selected_code,
        l3Title: clsOpts[l3.selected_code],
        l3Conf: l3.confidence,
        finalLevel: 3,
        lastCode: l3.selected_code,
        lastTitle: clsOpts[l3.selected_code]
    };
}

async function l4Node(state) {
    const comOpts = getCommodities(state.l1Code, state.l2Code, state.l3Code);
    appendTrace("Querying L4 Commodity...");
    const l4 = await classifyLevel("Commodity (Level 4)", comOpts, `L1 ${state.l1Code} -> L2 ${state.l2Code} -> L3 ${state.l3Code}`, state.partNumber, state.description, state.refinedContext);
    appendTrace(`L4 Result: ${l4.selected_code} (${comOpts[l4.selected_code]}) conf: ${l4.confidence.toFixed(2)}`, "success");
    
    renderCard(4, l4.selected_code, comOpts[l4.selected_code], l4.confidence, l4.reasoning, true, l4._debug);
    
    return {
        l4Code: l4.selected_code,
        l4Title: comOpts[l4.selected_code],
        l4Conf: l4.confidence,
        finalLevel: 4,
        lastCode: l4.selected_code,
        lastTitle: comOpts[l4.selected_code]
    };
}

// Edge Routers
function routeL1(state) {
    if (state.l1Conf < state.threshold) return END;
    if (Object.keys(getFamilies(state.l1Code)).length === 0) return END;
    return "l2";
}

function routeL2(state) {
    if (state.l2Conf < state.threshold) return END;
    if (Object.keys(getClasses(state.l1Code, state.l2Code)).length === 0) return END;
    return "l3";
}

function routeL3(state) {
    if (state.l3Conf < state.threshold) return END;
    if (Object.keys(getCommodities(state.l1Code, state.l2Code, state.l3Code)).length === 0) return END;
    return "l4";
}

// Compile LangGraph
const workflow = new StateGraph(AgentState)
    .addNode("search", searchNode)
    .addNode("l1", l1Node)
    .addNode("l2", l2Node)
    .addNode("l3", l3Node)
    .addNode("l4", l4Node)
    
    .addEdge(START, "search")
    .addEdge("search", "l1")
    .addConditionalEdges("l1", routeL1)
    .addConditionalEdges("l2", routeL2)
    .addConditionalEdges("l3", routeL3)
    .addEdge("l4", END);

const app = workflow.compile();

// Classification Trigger
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
        appendTrace(`Starting LangGraph workflow for: ${partNumber || 'N/A'} - ${description}`);
        
        // Invoke Graph
        const finalState = await app.invoke({
            partNumber: partNumber,
            description: description,
            threshold: threshold
        });
        
        renderFinalSummary(finalState.lastCode, finalState.lastTitle, finalState.finalLevel);
        appendTrace("LangGraph execution complete.", "info");

    } catch (e) {
        appendTrace(`Classification error: ${e.message}`, "error");
        renderError(e.message);
    } finally {
        els.classifyBtn.disabled = false;
        els.classifyBtn.innerHTML = '🚀 Classify Part';
    }
});
