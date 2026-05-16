// main.js
import { els, initUI, appendTrace, renderCard, renderFinalSummary, renderSearchContext, renderError } from './ui.js';
import { loadUNSPSC, isUNSPSCLoaded, getSegments, getFamilies, getClasses, getCommodities } from './unspsc.js';
import { initEngine, isEngineLoaded, classifyLevel, refineSearchContext, auditClassification } from './llm.js';
import { StateGraph, START, END, Annotation } from "./langgraph.js";
import { performWebSearch } from './search.js';
import { initVectorEngine, prepareIndex, searchCandidates } from './vector.js';

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
        await initVectorEngine();
        if (!isUNSPSCLoaded()) {
            await loadUNSPSC();
        }
        await prepareIndex();
        els.statusDot.className = 'status-indicator ready';
        els.statusText.textContent = 'Model Ready';
        els.progressContainer.classList.add('hidden');
        els.progressText.textContent = '';
        els.loadModelBtn.textContent = 'Model Loaded';
        els.classifyBtn.disabled = false;
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
    topCandidates: Annotation(),

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

    // Always refine/infer context, even if web search fails
    let refinedContext = await refineSearchContext(state.partNumber, state.description, searchContext);

    const title = searchContext ? "✨ LLM Refined Web Context" : "🧠 LLM Zero-Shot Inferred Context";
    renderSearchContext(query, refinedContext, title);

    return { refinedContext };
}

async function retrievalNode(state) {
    // Only use user provided description as requested
    const query = state.description.trim();
    const topCandidates = await searchCandidates(query, 40); // Optimum K = 40 for UNSPSC retrieval

    // UI rendering of candidates removed as requested
    // import('./ui.js').then(ui => ui.renderTopCandidates(topCandidates));

    return { topCandidates };
}

// Execute Level with Max 1 Retry
async function executeLevelWithRetry(state, levelName, getOptionsFn, parentPath, cardLevel) {
    let allOptions = { ...getOptionsFn() };
    let options = {};

    // Filter options based on Top K candidates to focus classification
    if (state.topCandidates && state.topCandidates.length > 0) {
        const candidateCodes = state.topCandidates.map(c => c.code);

        // Find which of allOptions are ancestors of or directly are the top candidates
        // We look at the 'path' property if available, or just check the hierarchy
        for (let [code, details] of Object.entries(allOptions)) {
            // Check if this option (Segment, Family, or Class) is an ancestor of any top candidate
            const isRelevant = state.topCandidates.some(cand => {
                // Commodity codes contain ancestor codes in their structure 
                // e.g. Seg (2 digits) + Fam (2) + Cls (2) + Com (2)
                return cand.code.startsWith(code.substring(0, cardLevel * 2));
            });

            if (isRelevant) {
                options[code] = details;
            }
        }

        // Fallback: If filtering returns nothing (rare), use all options
        if (Object.keys(options).length === 0) {
            appendTrace(`Filtering resulted in 0 options for ${levelName}. Falling back to all options.`, "warning");
            options = allOptions;
        } else {
            appendTrace(`Filtered ${levelName} from ${Object.keys(allOptions).length} to ${Object.keys(options).length} options based on Top K retrieval.`, "info");
        }
    } else {
        options = allOptions;
    }

    let attempt = 0;
    let feedback = null;
    let bestResult = null;
    let finalDebug = null;

    while (attempt < 2) {
        if (Object.keys(options).length === 0) break;

        const classification = await classifyLevel(levelName, options, parentPath, state.partNumber, state.description, state.refinedContext, feedback);
        const code = classification.selected_code;
        const title = options[code] ? options[code].title : "Unknown";
        finalDebug = classification._debug;

        const audit = await auditClassification(state.partNumber, state.description, state.refinedContext, levelName, code, title);

        if (audit.is_correct) {
            appendTrace(`Audit CORRECT.`, "success");
            bestResult = { code, title, confidence: classification.confidence, reasoning: classification.reasoning };
            break;
        } else {
            appendTrace(`Audit INCORRECT: ${audit.reasoning}`, "warning");
            attempt++;
            if (attempt < 2) {
                appendTrace("Retrying classification with auditor feedback...", "info");
                delete options[code]; // Ban this code from the enum
                feedback = `PREVIOUS REJECTION: You selected "${title}" (Code ${code}). Auditor rejected it: "${audit.reasoning}". Suggested alternative: "${audit.suggested_alternative || 'None'}". Pick a DIFFERENT valid code.`;
            } else {
                appendTrace("Max retries reached. Halting.", "error");
                bestResult = {
                    code,
                    title: `${title} ⚠️ (Auditor Rejected)`,
                    confidence: 0,
                    reasoning: classification.reasoning + ` ⚠️ (Failed Audit)`
                };
            }
        }
    }

    if (!bestResult) {
        return { confidence: 0, title: "Failed", code: "", reasoning: "No options available." };
    }

    let goNext = bestResult.confidence >= state.threshold;
    // Don't go next if we are at L4
    let isFinal = cardLevel === 4 || !goNext;

    renderCard(cardLevel, bestResult.code, bestResult.title, bestResult.confidence, bestResult.reasoning, isFinal, finalDebug);
    return bestResult;
}

async function l1Node(state) {
    appendTrace("Querying L1 Segment...");
    const res = await executeLevelWithRetry(state, "Segment (Level 1)", () => getSegments(), "", 1);

    return {
        l1Code: res.code,
        l1Title: res.title,
        l1Conf: res.confidence,
        finalLevel: 1,
        lastCode: res.code,
        lastTitle: res.title
    };
}

async function l2Node(state) {
    appendTrace("Querying L2 Family...");
    const res = await executeLevelWithRetry(state, "Family (Level 2)", () => getFamilies(state.l1Code), `L1 ${state.l1Code}: ${state.l1Title}`, 2);

    return {
        l2Code: res.code,
        l2Title: res.title,
        l2Conf: res.confidence,
        finalLevel: 2,
        lastCode: res.code,
        lastTitle: res.title
    };
}

async function l3Node(state) {
    appendTrace("Querying L3 Class...");
    const res = await executeLevelWithRetry(state, "Class (Level 3)", () => getClasses(state.l1Code, state.l2Code), `L1 ${state.l1Code} -> L2 ${state.l2Code}`, 3);

    return {
        l3Code: res.code,
        l3Title: res.title,
        l3Conf: res.confidence,
        finalLevel: 3,
        lastCode: res.code,
        lastTitle: res.title
    };
}

async function l4Node(state) {
    appendTrace("Querying L4 Commodity...");
    const res = await executeLevelWithRetry(state, "Commodity (Level 4)", () => getCommodities(state.l1Code, state.l2Code, state.l3Code), `L1 ${state.l1Code} -> L2 ${state.l2Code} -> L3 ${state.l3Code}`, 4);

    return {
        l4Code: res.code,
        l4Title: res.title,
        l4Conf: res.confidence,
        finalLevel: 4,
        lastCode: res.code,
        lastTitle: res.title
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
    .addNode("retrieval", retrievalNode)
    .addNode("l1", l1Node)
    .addNode("l2", l2Node)
    .addNode("l3", l3Node)
    .addNode("l4", l4Node)

    .addEdge(START, "search")
    .addEdge("search", "retrieval")
    .addEdge("retrieval", "l1")
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
