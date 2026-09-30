export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateNodeStartup } = await import("./instrumentation-node");
    validateNodeStartup();
  }
}
