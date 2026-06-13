import { appendAuditEvent } from "./audit.js";
import { createWorkspaceBranch, deleteWorkspaceBranch, mergeWorkspaceBranch } from "../security/branch.js";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
export function auditMiddleware(options = {}) {
    const emit = options.emit;
    const clock = options.clock ?? (() => new Date());
    return async (invocation, next) => {
        const { name, risk, input, context } = invocation;
        const audit = !!context.audit;
        emit?.({ type: "rune.requested", rune: name, at: clock() });
        if (audit) {
            await appendAuditEvent(context.workspace, {
                type: "rune.requested",
                sessionId: context.sessionId,
                rune: name,
                risk,
                input,
            });
        }
        try {
            const output = await next();
            emit?.({ type: "rune.completed", rune: name, at: clock() });
            if (audit) {
                await appendAuditEvent(context.workspace, {
                    type: "rune.completed",
                    sessionId: context.sessionId,
                    rune: name,
                    risk,
                    output,
                });
            }
            return output;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            emit?.({ type: "rune.failed", rune: name, error: message, at: clock() });
            if (audit) {
                await appendAuditEvent(context.workspace, {
                    type: "rune.failed",
                    sessionId: context.sessionId,
                    rune: name,
                    risk,
                    error: message,
                });
            }
            throw error;
        }
    };
}
export function permissionMiddleware(options) {
    const policy = options.policy;
    const emit = options.emit;
    const clock = options.clock ?? (() => new Date());
    return async (invocation, next) => {
        const { name, risk, input, context } = invocation;
        const decision = await policy.decide({
            rune: name,
            risk,
            input,
            workspace: context.workspace,
            sessionId: context.sessionId,
        });
        if (!decision.allowed) {
            emit?.({ type: "rune.denied", rune: name, reason: decision.reason, at: clock() });
            if (context.audit) {
                await appendAuditEvent(context.workspace, {
                    type: "rune.denied",
                    sessionId: context.sessionId,
                    rune: name,
                    risk,
                    input,
                    reason: decision.reason,
                });
            }
            throw new Error(`Rune denied: ${name}: ${decision.reason}`);
        }
        if (context.audit) {
            await appendAuditEvent(context.workspace, {
                type: "rune.allowed",
                sessionId: context.sessionId,
                rune: name,
                risk,
                input,
                reason: decision.reason,
            });
        }
        return next();
    };
}
export function isolationMiddleware() {
    return async (invocation, next) => {
        const { risk, context } = invocation;
        const isMutative = risk === "write" || risk === "execute";
        if (!isMutative) {
            return next();
        }
        const branchId = `${context.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const branchDir = await createWorkspaceBranch(context.workspace, branchId);
        try {
            invocation.context = { ...context, workspace: branchDir };
            const output = await next();
            await mergeWorkspaceBranch(context.workspace, branchId);
            return output;
        }
        finally {
            await deleteWorkspaceBranch(context.workspace, branchId);
        }
    };
}
export function skillMiddleware(skills) {
    let injected = false;
    return async (invocation, next) => {
        if (injected)
            return next();
        injected = true;
        const relevant = await skills.retrieveRelevant(invocation.context.state?.objective ?? invocation.name);
        if (relevant.length > 0) {
            const skillText = skills.formatForPrompt(relevant);
            invocation.context = { ...invocation.context };
            invocation.context.state = { ...invocation.context.state, skillContext: skillText };
        }
        return next();
    };
}
export function stagingMiddleware(store) {
    return async (invocation, next) => {
        const { risk } = invocation;
        if (risk !== "write" && risk !== "execute")
            return next();
        const output = await next();
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await store.stage({
            id,
            rune: invocation.name,
            input: invocation.input,
            output,
            sessionId: invocation.context.sessionId,
            risk,
            createdAt: new Date().toISOString(),
        });
        return { staged: true, id, message: `Action staged for review. Use /pending to review, /approve ${id} to apply.` };
    };
}
export function learningMiddleware(workspace, skills) {
    let callCount = 0;
    const tracePath = join(workspace, ".rimuru", "learning", "traces.jsonl");
    return async (invocation, next) => {
        const startTime = Date.now();
        let output;
        let error;
        try {
            output = await next();
            return output;
        }
        catch (e) {
            error = e instanceof Error ? e.message : String(e);
            throw e;
        }
        finally {
            callCount++;
            const traceRecord = JSON.stringify({
                rune: invocation.name,
                risk: invocation.risk,
                sessionId: invocation.context.sessionId,
                error: error ?? null,
                durationMs: Date.now() - startTime,
                at: new Date().toISOString(),
            });
            try {
                await mkdir(join(workspace, ".rimuru", "learning"), { recursive: true });
                await appendFile(tracePath, traceRecord + "\n", "utf8");
            }
            catch { }
            if (callCount % 10 === 0 && skills.list().length > 0) {
                const reviewRitual = {
                    id: `learning-review-${Date.now()}`,
                    prompt: `Review the last 10+ rune invocations in ${tracePath} and identify patterns:\n- Repeated errors and their root causes\n- Sequences of 3+ runes that always run together (candidate for a workflow skill)\n- Any missing tool that would have simplified the work\nIf you find a pattern worth preserving, create a skill via workspace.compileRune that encodes the pattern as a reusable tool.`,
                    sessionId: `learning:review`,
                    everyMinutes: 1440,
                    startAt: new Date(Date.now() + 60_000),
                };
                // Schedule the review — fires after current turn completes
                setImmediate(async () => {
                    try {
                        const { createRitual } = await import("../rituals/rituals.js");
                        await createRitual(workspace, reviewRitual);
                    }
                    catch { }
                });
            }
        }
    };
}
//# sourceMappingURL=middleware.js.map