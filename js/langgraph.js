// A lightweight, offline-compatible implementation of LangGraph's StateGraph pattern
export const START = "__start__";
export const END = "__end__";

export const Annotation = function() {
    return { _marker: true };
};
Annotation.Root = function(stateDef) {
    return stateDef;
};

export class StateGraph {
    constructor(stateSchema) {
        this.nodes = {};
        this.edges = {};
        this.conditionalEdges = {};
        this.stateSchema = stateSchema;
    }

    addNode(name, func) {
        this.nodes[name] = func;
        return this;
    }

    addEdge(from, to) {
        if (!this.edges[from]) this.edges[from] = [];
        this.edges[from].push(to);
        return this;
    }

    addConditionalEdges(from, router) {
        this.conditionalEdges[from] = router;
        return this;
    }

    compile() {
        return {
            invoke: async (initialState) => {
                let state = { ...initialState };
                let currentNode = this.edges[START] ? this.edges[START][0] : null;

                while (currentNode && currentNode !== END) {
                    const nodeFunc = this.nodes[currentNode];
                    if (!nodeFunc) throw new Error(`Node ${currentNode} not found`);

                    // Execute node and merge state updates
                    const updates = await nodeFunc(state);
                    state = { ...state, ...updates };

                    // Determine next node
                    if (this.conditionalEdges[currentNode]) {
                        currentNode = this.conditionalEdges[currentNode](state);
                    } else if (this.edges[currentNode]) {
                        currentNode = this.edges[currentNode][0];
                    } else {
                        currentNode = END;
                    }
                }
                return state;
            }
        };
    }
}
