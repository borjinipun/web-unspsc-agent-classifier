// llm.js
import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import { appendTrace, els } from './ui.js';

let engine = null;
export const SELECTED_MODEL = "Phi-3.5-mini-instruct-q4f16_1-MLC"; 

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
    appendTrace("Refining raw web search context using LLM...");
    
    const systemPrompt = "You are a procurement data extraction assistant. Your task is to analyze raw web search text about a product and distill it into a concise summary.";
    
    const humanPrompt = `Product: ${partNumber} - ${description}
Raw Web Search Text: ${rawSearchContext}

Extract the following information based ONLY on the search text:
1. Category/Type of product
2. Primary Use Case
3. Domain/Industry it is used in

Output ONLY the extracted details in a short, concise paragraph. Do not invent details not found in the text.`;

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

export async function classifyLevel(levelName, options, parentPath, partNumber, description, searchContext) {
    const optsText = Object.entries(options).map(([c, t]) => `  ${c}: ${t}`).join("\n");
    
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
    
    humanPrompt += `\n
=== AVAILABLE CODES ===
${optsText}

Choose the BEST match from the Available Codes above.
Output EXACTLY the 8-digit code. Do not abbreviate.

Output format MUST be:
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
                enum: Object.keys(options),
                description: "The selected UNSPSC code"
            },
            confidence: {
                type: "number",
                description: "Confidence from 0.0 to 1.0"
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
