// main.js
import { els, initUI, appendTrace, renderCard, renderFinalSummary, renderSearchContext, renderError, renderTopCandidates } from './ui.js';
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
    lastTitle: Annotation(),
    
    l1Correct: Annotation(), l1Feedback: Annotation(),
    l2Correct: Annotation(), l2Feedback: Annotation(),
    l3Correct: Annotation(), l3Feedback: Annotation(),
    l4Correct: Annotation(), l4Feedback: Annotation()
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
    const topCandidates = await searchCandidates(query, 100); // K=100 for robust filtering
    
    // Show candidates in the sidebar
    renderTopCandidates(topCandidates);

    return { topCandidates };
}

// Execute Level with Max 1 Retry (Same level)
async function executeLevel(state, levelName, getOptionsFn, parentPath, cardLevel, parentCode = null) {
    let allOptions = { ...getOptionsFn() };
    let options = {};

    // Perform fresh retrieval for this specific subtree
    const query = state.description.trim();
    // Use K=20 for subtree focus
    const subtreeCandidates = await searchCandidates(query, 20, parentCode);
    
    // Filter options based on subtree candidates
    if (subtreeCandidates.length > 0) {
        for (let [code, details] of Object.entries(allOptions)) {
            const matchingChildren = subtreeCandidates.filter(cand => {
                return cand.code.startsWith(code.substring(0, cardLevel * 2));
            });

            if (matchingChildren.length > 0) {
                // Enrich title with examples from subtree Top K
                const examples = matchingChildren
                    .slice(0, 3) 
                    .map(c => c.title)
                    .join(", ");
                
                options[code] = {
                    ...details,
                    title: `${details.title} (Top Matches: ${examples}...)`
                };
            }
        }
        
        // Fallback: if no candidates match children, use all options
        if (Object.keys(options).length === 0) options = allOptions;
        else appendTrace(`Filtered ${levelName} to ${Object.keys(options).length} options via subtree search.`, "info");
    } else {
        options = allOptions;
    }

    let attempt = 0;
    let feedback = null;
    let finalResult = null;

    while (attempt < 2) {
        if (Object.keys(options).length === 0) break;

        const classification = await classifyLevel(levelName, options, parentPath, state.partNumber, state.description, state.refinedContext, feedback);
        const code = classification.selected_code;
        const title = options[code] ? options[code].title : "Unknown";

        appendTrace(`Auditing ${levelName}: ${title}...`, "info");
        const audit = await auditClassification(state.partNumber, state.description, state.refinedContext, levelName, code, title);
        
        if (audit.is_correct || attempt >= 1) {
            if (audit.is_correct) appendTrace(`${levelName} Audit PASSED.`, "success");
            else appendTrace(`${levelName} Audit FAILED after retry. Moving forward anyway.`, "warning");
            
            finalResult = { 
                code, title, confidence: classification.confidence, reasoning: classification.reasoning,
                debug: { ...classification._debug, audit }
            };
            break;
        } else {
            appendTrace(`${levelName} Audit FAILED: ${audit.reasoning}. Retrying...`, "warning");
            delete options[code]; 
            feedback = `PREVIOUS REJECTION: You selected "${title}" (${code}). Auditor rejected it: "${audit.reasoning}". PICK A DIFFERENT OPTION.`;
            attempt++;
        }
    }

    if (!finalResult) {
        return { code: "", title: "Failed", confidence: 0 };
    }

    renderCard(cardLevel, finalResult.code, finalResult.title, finalResult.confidence, finalResult.reasoning, cardLevel === 4, finalResult.debug);
    return finalResult;
}

async function l1Node(state) {
    appendTrace("Querying L1 Segment...");
    const res = await executeLevel(state, "Segment (Level 1)", () => getSegments(), "", 1, null);
    return { 
        l1Code: res.code, l1Title: res.title, l1Conf: res.confidence, 
        lastCode: res.code, lastTitle: res.title, finalLevel: 1 
    };
}

async function l2Node(state) {
    appendTrace("Querying L2 Family...");
    const res = await executeLevel(state, "Family (Level 2)", () => getFamilies(state.l1Code), `L1: ${state.l1Title}`, 2, state.l1Code);
    return { 
        l2Code: res.code, l2Title: res.title, l2Conf: res.confidence, 
        lastCode: res.code, lastTitle: res.title, finalLevel: 2 
    };
}

async function l3Node(state) {
    appendTrace("Querying L3 Class...");
    const res = await executeLevel(state, "Class (Level 3)", () => getClasses(state.l1Code, state.l2Code), `L1: ${state.l1Title} > L2: ${state.l2Title}`, 3, state.l2Code);
    return { 
        l3Code: res.code, l3Title: res.title, l3Conf: res.confidence, 
        lastCode: res.code, lastTitle: res.title, finalLevel: 3 
    };
}

async function l4Node(state) {
    appendTrace("Querying L4 Commodity...");
    const res = await executeLevel(state, "Commodity (Level 4)", () => getCommodities(state.l1Code, state.l2Code, state.l3Code), `L1: ${state.l1Title} > L2: ${state.l2Title} > L3: ${state.l3Title}`, 4, state.l3Code);
    return { 
        l4Code: res.code, l4Title: res.title, l4Conf: res.confidence, 
        lastCode: res.code, lastTitle: res.title, finalLevel: 4 
    };
}

// Routers (Linear flow, retries handled inside nodes)
function routeL1(state) {
    if (!state.l1Code) return END;
    return "l2";
}

function routeL2(state) {
    if (!state.l2Code) return END;
    return "l3";
}

function routeL3(state) {
    if (!state.l3Code) return END;
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
    
    // Clear candidates list
    els.candidatesAccordion.classList.add('hidden');
    els.candidatesAccordion.classList.remove('open');
    els.candidatesList.innerHTML = '<div class="empty-state" style="min-height: 80px; font-size: 0.75rem;">Waiting for retrieval...</div>';
    
    try {
        appendTrace(`Starting LangGraph workflow for: ${partNumber || 'N/A'} - ${description}`);

        // Invoke Graph
        const finalState = await app.invoke({
            partNumber: partNumber,
            description: description
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
