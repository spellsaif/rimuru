export class MockShard {
    name = "mock";
    async complete(messages) {
        const userMessage = messages[messages.length - 1];
        const content = `Rimuru heard: ${userMessage ? userMessage.content : ""}`;
        return { content };
    }
}
//# sourceMappingURL=mock.js.map