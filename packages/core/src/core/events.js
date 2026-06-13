export class FlowBus {
    #events = [];
    #listeners = new Set();
    emit(event) {
        this.#events.push(event);
        for (const listener of this.#listeners) {
            listener(event);
        }
    }
    listen(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    snapshot() {
        return [...this.#events];
    }
}
//# sourceMappingURL=events.js.map