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
    resultsContainer: document.getElementById('resultsContainer'),
    traceLog: document.getElementById('traceLog'),
    accordionHeader: document.getElementById('traceHeader'),
    accordion: document.getElementById('traceAccordion'),
    traceContent: document.getElementById('traceContent'),
    candidatesAccordion: document.getElementById('candidatesAccordion'),
    candidatesHeader: document.getElementById('candidatesHeader'),
    candidatesList: document.getElementById('candidatesList')
};

export function initUI() {
    els.accordionHeader.addEventListener('click', () => {
        els.accordion.classList.toggle('open');
    });

    els.candidatesHeader.addEventListener('click', () => {
        els.candidatesAccordion.classList.toggle('open');
    });
}

export function appendTrace(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `trace-entry trace-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    els.traceLog.appendChild(entry);
    els.traceContent.scrollTop = els.traceLog.scrollHeight;
}

const LEVEL_NAMES = {
    1: 'SEGMENT',
    2: 'FAMILY',
    3: 'CLASS',
    4: 'COMMODITY'
};

export function renderCard(level, title, code, confidence, reasoning, isFinal = false, debugInfo = null) {
    const card = document.createElement('div');
    card.className = 'level-card';
    
    const name = LEVEL_NAMES[level] || 'LEVEL';
    const confColor = confidence > 0.8 ? 'var(--success)' : confidence > 0.6 ? 'var(--warning)' : 'var(--error)';

    let debugHtml = '';
    if (debugInfo) {
        const esc = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        debugHtml = `
            <details class="debug-panel" style="margin-top: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 0.5rem; font-size: 0.7rem;">
                <summary style="cursor: pointer; color: var(--accent-2); font-weight: 700; font-family: var(--font-heading);">🔍 DEBUG TRACE</summary>
                <div style="margin-top: 0.75rem; white-space: pre-wrap; color: var(--text-muted); max-height: 250px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; line-height: 1.4;">
<strong style="color:var(--text-primary)">--- SYSTEM PROMPT ---</strong>
${esc(debugInfo.systemPrompt)}

<strong style="color:var(--text-primary)">--- LLM OUTPUT ---</strong>
${esc(debugInfo.rawOutput)}
                </div>
            </details>
        `;
    }

    card.innerHTML = `
        <span class="level-badge">L${level} · ${name} ${isFinal ? '· FINAL SELECTION' : ''}</span>
        <h4 class="level-title">${title}</h4>
        <div class="level-code">${code}</div>
        
        <div class="confidence-indicator">
            <div class="conf-bar-bg">
                <div class="conf-bar-fill" style="width: ${confidence * 100}%; background: ${confColor};"></div>
            </div>
            <span style="font-size: 0.75rem; font-weight: 800; color: ${confColor}; min-width: 35px;">${Math.round(confidence * 100)}%</span>
        </div>
        
        <p class="reasoning" style="margin-top: 0.75rem; padding-top: 0.75rem;">${reasoning}</p>
        ${debugHtml}
    `;
    
    els.resultsContainer.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

export function renderFinalSummary(code, title, level) {
    const summary = document.createElement('div');
    summary.className = 'final-summary';
    summary.innerHTML = `
        <div style="font-size: 0.7rem; font-weight: 800; color: var(--accent-1); text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 0.75rem;">Classification Complete</div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 2.5rem; font-weight: 800; color: white; margin-bottom: 0.5rem; letter-spacing: -0.02em;">${code}</div>
        <div style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${title}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">Level ${level} · UNSPSC v24</div>
    `;
    els.resultsContainer.appendChild(summary);
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function renderSearchContext(query, snippet, title = "✨ Web Research Distillation") {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.05), rgba(129, 140, 248, 0.05))';
    card.style.borderColor = 'rgba(56, 189, 248, 0.2)';
    
    card.innerHTML = `
        <span class="level-badge" style="color: var(--accent-1); margin-bottom: 0.25rem;">${title}</span>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
            <strong style="color: var(--text-primary)">Topic:</strong> ${query}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-primary); line-height: 1.5; border-left: 2px solid var(--accent-1); padding-left: 0.75rem; font-style: italic;">
            ${snippet}
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

export function renderTopCandidates(candidates) {
    els.candidatesAccordion.classList.remove('hidden');
    els.candidatesAccordion.classList.add('open');
    els.candidatesList.innerHTML = '';

    if (candidates.length === 0) {
        els.candidatesList.innerHTML = '<div class="empty-state">No candidates found.</div>';
        return;
    }

    candidates.forEach((c, i) => {
        const item = document.createElement('div');
        item.style.padding = '0.75rem';
        item.style.background = 'var(--bg-sub)';
        item.style.borderRadius = '10px';
        item.style.border = '1px solid var(--border-color)';
        item.style.fontSize = '0.75rem';
        item.style.animation = `slideUp 0.3s ease forwards ${i * 0.05}s`;
        item.style.opacity = '0';
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.25rem;">
                <strong style="color: var(--text-primary);">${c.title}</strong>
            </div>
            <div style="font-family: monospace; color: var(--accent-1); font-size: 0.7rem; margin-bottom: 0.25rem;">${c.code}</div>
            <div style="color: var(--text-muted); font-size: 0.65rem; line-height: 1.3;">${c.path}</div>
        `;
        els.candidatesList.appendChild(item);
    });
}
