import { StateGraph, END, START, Annotation } from "https://esm.sh/@langchain/langgraph";

const GraphState = Annotation.Root({
    count: Annotation()
});

const graph = new StateGraph(GraphState)
    .addNode("node1", (state) => {
        return { count: state.count + 1 };
    })
    .addEdge(START, "node1")
    .addEdge("node1", END);

const app = graph.compile();
console.log("Compiled successfully!");
