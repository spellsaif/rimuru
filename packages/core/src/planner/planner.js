export function planObjective(objective) {
    const lowered = objective.toLowerCase();
    const steps = [{ id: 1, goal: "Understand the user objective" }];
    if (lowered.includes("git") || lowered.includes("diff") || lowered.includes("commit")) {
        steps.push({ id: 2, goal: "Inspect repository state", suggestedRune: "git.status" });
        steps.push({ id: 3, goal: "Inspect code changes", suggestedRune: "git.diff" });
    }
    else if (lowered.includes("search") || lowered.includes("find")) {
        steps.push({ id: 2, goal: "Search workspace for relevant text", suggestedRune: "workspace.search" });
    }
    else if (lowered.includes("edit") || lowered.includes("change") || lowered.includes("fix")) {
        steps.push({ id: 2, goal: "Read target files", suggestedRune: "workspace.readFile" });
        steps.push({ id: 3, goal: "Prepare a safe file edit", suggestedRune: "workspace.editFile" });
    }
    steps.push({ id: steps.length + 1, goal: "Return a concise result with evidence" });
    return { objective, steps };
}
//# sourceMappingURL=planner.js.map