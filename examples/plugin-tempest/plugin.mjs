export function createRunes() {
  return [
    {
      name: "tempest.echo",
      description: "Echoes JSON input for plugin smoke tests.",
      risk: "read",
      async invoke(input) {
        return { input, plugin: "tempest" };
      },
    },
    {
      name: "tempest.note",
      description: "Returns a note payload that can be reviewed before enabling writes.",
      risk: "write",
      async invoke(input, context) {
        return { sessionId: context.sessionId, text: input.text ?? "tempest note" };
      },
    },
  ];
}
