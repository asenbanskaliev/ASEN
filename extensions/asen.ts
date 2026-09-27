type PiLike = {
  registerCommand?: (name: string, command: { description: string; handler: (...args: unknown[]) => unknown }) => void;
};

export default function asenExtension(pi: PiLike): void {
  pi.registerCommand?.("asen", {
    description: "Show ASEN harness status",
    handler: () => ({
      product: "ASEN",
      mode: "pi-native",
      status: "ready",
      principle: "ASEN extends Pi; it does not replace Pi."
    })
  });
}
