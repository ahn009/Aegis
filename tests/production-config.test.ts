import { describe, expect, it } from "vitest";
import { validateProductionConfig } from "../src/lib/production-config";

const good = {
  NODE_ENV: "production",
  VELORA_ENCRYPTION_KEY: "secret-a-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  VELORA_SESSION_SECRET: "secret-b-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  VELORA_AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  VELORA_APP_BASE_URL: "https://app.velora.example",
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "0123456789abcdefABCDEF0123456789",
};

describe("production configuration", () => {
  it("accepts a complete HTTPS configuration", () => {
    expect(() => validateProductionConfig(good)).not.toThrow();
  });

  it.each([
    ["missing session secret", { VELORA_SESSION_SECRET: undefined }],
    ["default encryption key", { VELORA_ENCRYPTION_KEY: "dev-velora-encryption-key-DO-NOT-USE-IN-PROD-32b!" }],
    ["shared secrets", { VELORA_SESSION_SECRET: good.VELORA_ENCRYPTION_KEY }],
    ["mock provider", { VELORA_AI_PROVIDER: "mock" }],
    ["missing API key", { OPENAI_API_KEY: undefined }],
    ["insecure app URL", { VELORA_APP_BASE_URL: "http://localhost:3000" }],
    ["invalid provider URL", { OPENAI_BASE_URL: "http://localhost:1234" }],
    ["missing Twilio account", { TWILIO_ACCOUNT_SID: undefined }],
    ["missing Twilio token", { TWILIO_AUTH_TOKEN: undefined }],
  ])("rejects %s", (_name, override) => {
    expect(() => validateProductionConfig({ ...good, ...override })).toThrow("Invalid production configuration");
  });

  it("allows local development without production secrets", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "development" })).not.toThrow();
  });
});
