// llm.js
import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import { appendTrace, els } from './ui.js';

let engine = null;
export const SELECTED_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

export async function initEngine(selectedModel) {
    if (engine) return true;

    appendTrace(`Initializing WebLLM Engine with ${selectedModel}...`);
    try {
        const initProgressCallback = (report) => {
            els.progressText.textContent = report.text;
            if (report.progress) {
                els.progressBar.style.width = `${Math.round(report.progress * 100)}%`;
            }
        };

        engine = await webllm.CreateMLCEngine(
            selectedModel,
            { initProgressCallback }
        );

        appendTrace("WebLLM Engine loaded successfully. Ready for inference.", "success");
        return true;
    } catch (err) {
        appendTrace(`Engine init error: ${err.message}`, "error");
        console.error(err);
        return false;
    }
}

export function isEngineLoaded() {
    return engine !== null;
}

export async function refineSearchContext(partNumber, description, rawSearchContext) {
    if (rawSearchContext) {
        appendTrace("Refining raw web search context using LLM...");
    } else {
        appendTrace("Web search failed. Instructing LLM to infer context zero-shot from Part Number and Description...");
    }

    const systemPrompt = "You are a procurement data extraction assistant. Your task is to analyze product information and distill it into a concise summary to facilitate hierarchical UNSPSC classification:.";

    let humanPrompt = "";
    if (rawSearchContext) {
        humanPrompt = `Product: ${partNumber} - ${description}\nRaw Web Search Text: ${rawSearchContext}\n\nExtract the following information based ONLY on the search text:\n1. UNSPSC Category/Type of product\n2. Primary Use Case\n3. Domain/Industry it is used in\n\nOutput ONLY the extracted details in a short, concise paragraph. Do not invent details not found in the text.`;
    } else {
        humanPrompt = `Product: ${partNumber} - ${description}\n\nNo web search data is available. Based ONLY on the product name and description, please infer and predict the following information:\n1. Likely UNSPSCCategory/Type of product\n2. Primary Use Case\n3. Domain/Industry it is used in\n\nOutput your predictions in a short, concise paragraph. Be highly logical.`;
    }

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: humanPrompt }
    ];

    const reply = await engine.chat.completions.create({
        messages,
        temperature: 0.1,
        max_tokens: 200
    });

    const refinement = reply.choices[0].message.content.trim();
    appendTrace("Context refinement complete.", "success");
    return refinement;
}

export async function classifyLevel(levelName, options, parentPath, partNumber, description, searchContext, auditorFeedback = null) {
    const optsText = Object.entries(options).map(([c, obj]) => {
        let defText = obj.definition ? obj.definition.trim() : "Not provided in UNSPSC taxonomy";
        return `  ${c}: ${obj.title} (Definition: ${defText})`;
    }).join("\n");

    const systemPrompt = `You are an expert UNSPSC procurement classifier. You MUST output ONLY valid JSON without any markdown formatting.`;

    let humanPrompt = `TASK: Classify the following product into the correct UNSPSC ${levelName}.

=== PRODUCT INFO ===
Part Number: ${partNumber}
Description: ${description}`;

    if (searchContext) {
        humanPrompt += `\nWeb Search Context: ${searchContext}`;
    }

    if (parentPath) {
        humanPrompt += `\nParent Classification: ${parentPath}`;
    }

    if (auditorFeedback) {
        humanPrompt += `\n\n🚨 AUDITOR FEEDBACK ON PREVIOUS ATTEMPT 🚨\n${auditorFeedback}\nYou MUST select a DIFFERENT code this time. Do NOT select the rejected code.`;
    }

    humanPrompt += `\n
=== AVAILABLE CODES ===
${optsText}

Analyze the product and select the most appropriate Code from the available options. Carefully read and evaluate the '(Definition: ...)' provided for each code to ensure the product perfectly matches the category's intended scope.

Output your decision strictly matching this JSON schema:
{
  "selected_code": "exact 8-digit code here",
  "confidence": 0.95,
  "reasoning": "brief 10-word justification here"
}`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: humanPrompt }
    ];

    const schema = {
        type: "object",
        properties: {
            selected_code: {
                type: "string",
                enum: Object.keys(options)
            },
            confidence: {
                type: "number",
                description: "Confidence score between 0.0 and 1.0"
            },
            reasoning: {
                type: "string",
                description: "Brief 10-word reasoning"
            }
        },
        required: ["selected_code", "confidence", "reasoning"]
    };

    appendTrace(`Compiling JSON schema with ${Object.keys(options).length} options...`);

    const reply = await engine.chat.completions.create({
        messages,
        temperature: 0.1,
        max_tokens: 500,
        response_format: {
            type: "json_object",
            schema: JSON.stringify(schema)
        }
    });

    let jsonStr = reply.choices[0].message.content;

    let parsed = {};
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        appendTrace(`Failed to parse JSON response: ${e.message}. Raw output: ${jsonStr}`, "error");
        throw new Error("Invalid JSON from LLM");
    }

    // Attach debug information for the UI
    parsed._debug = {
        systemPrompt: systemPrompt,
        humanPrompt: humanPrompt,
        rawOutput: jsonStr
    };

    return parsed;
}

export async function auditClassification(partNumber, description, refinedContext, levelName, code, title) {
    appendTrace(`Auditing ${levelName} classification...`, "info");

    const systemPrompt = `You are a UNSPSC taxonomy auditor. You MUST output ONLY valid JSON.`;
    const humanPrompt = `TASK: Review the following classification and determine if it accurately describes the product.
    
=== PRODUCT INFO ===
Part Number: ${partNumber}
Description: ${description}
Web Context: ${refinedContext || 'None'}

=== CHOSEN CLASSIFICATION ===
Level: ${levelName}
Category: ${title} (Code: ${code})

Is this classification correct and suitable? Or is there a completely different Category/Segment it should belong to instead?
Output JSON format:
{
  "is_correct": true, // or false
  "reasoning": "brief explanation",
  "suggested_alternative": "Alternative category name if wrong, or 'None' if correct"
}`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: humanPrompt }
    ];

    const schema = {
        type: "object",
        properties: {
            is_correct: { type: "boolean" },
            reasoning: { type: "string" },
            suggested_alternative: { type: "string" }
        },
        required: ["is_correct", "reasoning", "suggested_alternative"]
    };

    try {
        const reply = await engine.chat.completions.create({
            messages,
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: "json_object", schema: JSON.stringify(schema) }
        });

        return JSON.parse(reply.choices[0].message.content);
    } catch (e) {
        appendTrace(`Audit failed: ${e.message}`, "error");
        return { is_correct: true, reasoning: "Audit error", suggested_alternative: "None" };
    }
}
