/** Validate deployment settings before a production web or worker process serves traffic. */
export function validateProductionConfig(values: Readonly<Record<string, string | undefined>> = process.env): void {
  if (values.NODE_ENV !== "production") return;

  const errors: string[] = [];
  const secret = (name: string) => {
    const value = values[name]?.trim() ?? "";
    if (value.length < 32 || /dev|demo|example|test|placeholder|change.?me/i.test(value)) {
      errors.push(`${name} must be a unique, non-demo secret of at least 32 characters`);
    }
    return value;
  };
  const encryptionKey = secret("VELORA_ENCRYPTION_KEY");
  const sessionSecret = secret("VELORA_SESSION_SECRET");
  if (encryptionKey && encryptionKey === sessionSecret) errors.push("Production secrets must differ");

  if (values.VELORA_AI_PROVIDER !== "openai") errors.push("VELORA_AI_PROVIDER must be openai");
  if (!values.OPENAI_API_KEY?.trim() || /demo|example|test|placeholder|change.?me/i.test(values.OPENAI_API_KEY)) {
    errors.push("OPENAI_API_KEY must be configured");
  }

  for (const [name, fallback] of [
    ["VELORA_APP_BASE_URL", ""],
    ["OPENAI_BASE_URL", "https://api.openai.com/v1"],
  ] as const) {
    try {
      const url = new URL(values[name] ?? fallback);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid URL");
    } catch {
      errors.push(`${name} must be an HTTPS URL without embedded credentials or a fragment`);
    }
  }

  if (values.VELORA_VERIFY_WEBHOOKS !== "1") errors.push("VELORA_VERIFY_WEBHOOKS must be 1");
  if (errors.length) throw new Error(`Invalid production configuration:\n- ${errors.join("\n- ")}`);
}
