// ui.js
export const els = {
    loadModelBtn: document.getElementById('loadModelBtn'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    progressContainer: document.getElementById('progressContainer'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    modelSelect: document.getElementById('modelSelect'),
    classifyBtn: document.getElementById('classifyBtn'),
    partNumberInput: document.getElementById('partNumber'),
    descriptionInput: document.getElementById('description'),
    confSlider: document.getElementById('confidenceThreshold'),
    confValue: document.getElementById('confValue'),
    resultsContainer: document.getElementById('resultsContainer'),
    traceLog: document.getElementById('traceLog'),
    accordionHeader: document.getElementById('traceHeader'),
    accordion: document.querySelector('.accordion'),
    traceContent: document.getElementById('traceContent')
};

export function initUI() {
    els.confSlider.addEventListener('input', (e) => {
        els.confValue.textContent = `${e.target.value}%`;
    });

    els.accordionHeader.addEventListener('click', () => {
        els.accordion.classList.toggle('open');
    });
}

export function appendTrace(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `trace-entry trace-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    els.traceLog.appendChild(entry);
    els.traceContent.scrollTop = els.traceLog.scrollHeight;
}

const LEVEL_ICONS = { 1: "📦", 2: "📂", 3: "🗂", 4: "🏷" };
const LEVEL_NAMES = { 1: "Segment", 2: "Family", 3: "Class", 4: "Commodity" };
const CONF_COLOR = (c) => c >= 0.75 ? "var(--success)" : c >= 0.50 ? "var(--warning)" : "var(--error)";

export function renderCard(level, code, title, confidence, reasoning, isFinal = false, debugInfo = null) {
    const pct = Math.round(confidence * 100);
    const color = CONF_COLOR(confidence);
    const icon = LEVEL_ICONS[level];
    const name = LEVEL_NAMES[level];
    
    const card = document.createElement('div');
    card.className = 'level-card';
    card.style.animationDelay = `${(level - 1) * 0.1}s`;
    
    let debugHtml = '';
    if (debugInfo) {
        // Escape HTML for safety
        const esc = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        debugHtml = `
            <details class="debug-panel" style="margin-top: 1rem; padding: 0.5rem; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: 0.5rem; font-size: 0.75rem;">
                <summary style="cursor: pointer; color: var(--accent-2); font-weight: 600;">🔍 Debug Trace</summary>
                <div style="margin-top: 0.75rem; white-space: pre-wrap; color: var(--text-muted); max-height: 300px; overflow-y: auto; font-family: monospace;">
<strong style="color:var(--text-primary)">--- SYSTEM PROMPT ---</strong>
${esc(debugInfo.systemPrompt)}

<strong style="color:var(--text-primary)">--- HUMAN PROMPT (CONTEXT) ---</strong>
${esc(debugInfo.humanPrompt)}

<strong style="color:var(--text-primary)">--- LLM OUTPUT ---</strong>
${esc(debugInfo.rawOutput)}
                </div>
            </details>
        `;
    }

    card.innerHTML = `
        <div class="level-card-header">
            <span style="font-size: 1.25rem">${icon}</span>
            <span class="level-badge">Level ${level} · ${name}</span>
            ${isFinal ? '<span class="final-badge">FINAL</span>' : ''}
        </div>
        <div class="level-title">${title}</div>
        <div class="level-code">Code: ${code}</div>
        
        <div class="conf-bar-container">
            <div class="conf-bar" style="width: ${pct}%; background-color: ${color}"></div>
        </div>
        <div class="conf-text" style="color: ${color}">${pct}% confidence</div>
        
        <div class="reasoning">💬 ${reasoning}</div>
        ${debugHtml}
    `;
    els.resultsContainer.appendChild(card);
}

export function renderFinalSummary(code, title, level) {
    const summary = document.createElement('div');
    summary.className = 'final-summary';
    summary.innerHTML = `
        <div class="final-summary-label">Final UNSPSC Code</div>
        <div class="final-summary-code">${code}</div>
        <div class="final-summary-title">${title}</div>
        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem">Classified to Level ${level} · ${LEVEL_NAMES[level]}</div>
    `;
    els.resultsContainer.appendChild(summary);
}

export function renderSearchContext(query, snippet, title = "✨ LLM Refined Web Context") {
    const card = document.createElement('div');
    card.className = 'glass-sub';
    card.style.marginBottom = '1rem';
    card.innerHTML = `
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-1); text-transform: uppercase; margin-bottom: 0.5rem">
            ${title}
        </div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
            <strong>Query:</strong> ${query}
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; border-left: 2px solid var(--border-color); padding-left: 0.5rem;">
            ${snippet || 'No useful context found.'}
        </div>
    `;
    els.resultsContainer.appendChild(card);
}

export function renderError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty-state';
    errorDiv.style.color = 'var(--error)';
    errorDiv.textContent = `Error: ${message}`;
    els.resultsContainer.appendChild(errorDiv);
}
