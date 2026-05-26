import { getQuickJS } from "quickjs-emscripten";

/**
 * Executes untrusted JS code dynamically in a secure, resource-constrained WebAssembly VM.
 * Exposes the `input` variable to the script and returns the result (either via return value or by setting `globalThis.output`).
 */
export async function executeDynamicRune(code: string, input: unknown): Promise<unknown> {
  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();
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
      throw new Error(`Dynamic VM execution error: ${errorStr}`);
    }

    const outputVal = vm.getProp(vm.global, "output");
    let output: unknown;
    if (outputVal && vm.dump(outputVal) !== undefined) {
      output = vm.dump(outputVal);
      outputVal.dispose();
    } else {
      output = vm.dump(result.value);
    }
    result.value.dispose();
    return output;
  } finally {
    vm.dispose();
  }
}
