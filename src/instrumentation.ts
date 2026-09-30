import { validateProductionConfig } from "./lib/production-config";

export function register() {
  try {
    validateProductionConfig();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
