import { getQuickJS } from "quickjs-emscripten";
export async function executeDynamicRune(code, input, options = {}) {
    const quickJs = await getQuickJS();
    const vm = quickJs.newContext();
    const timeoutMs = options.timeoutMs ?? 1_000;
    const deadline = Date.now() + timeoutMs;
    const runtime = vm.runtime;
    if (runtime?.setMemoryLimit)
        runtime.setMemoryLimit(options.memoryLimitBytes ?? 8 * 1024 * 1024);
    if (runtime?.setMaxStackSize)
        runtime.setMaxStackSize(options.maxStackSizeBytes ?? 512 * 1024);
    if (runtime?.setInterruptHandler) {
        runtime.setInterruptHandler(() => Date.now() > deadline);
    }
    try {
        // Inject input safely as JSON to avoid injection strings inside the script
        const vmInput = vm.newString(JSON.stringify(input));
        vm.setProp(vm.global, "RAW_INPUT", vmInput);
        vmInput.dispose();
        vm.evalCode(`const input = JSON.parse(RAW_INPUT);`);
        const result = vm.evalCode(code);
        if (result.error) {
            const errorVal = result.error;
            const errorStr = vm.dump(errorVal);
            errorVal.dispose();
            if (Date.now() >= deadline || String(errorStr).toLowerCase().includes("interrupted")) {
                throw new Error(`Dynamic VM execution timed out after ${timeoutMs}ms`);
            }
            throw new Error(`Dynamic VM execution error: ${errorStr}`);
        }
        const outputVal = vm.getProp(vm.global, "output");
        let output;
        if (outputVal && vm.dump(outputVal) !== undefined) {
            output = vm.dump(outputVal);
            outputVal.dispose();
        }
        else {
            output = vm.dump(result.value);
        }
        result.value.dispose();
        return output;
    }
    finally {
        if (runtime?.setInterruptHandler)
            runtime.setInterruptHandler(() => false);
        vm.dispose();
    }
}
//# sourceMappingURL=sandbox-vm.js.map