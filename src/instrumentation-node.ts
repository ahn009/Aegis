import { validateProductionConfig } from "./lib/production-config";

export function validateNodeStartup() {
  try {
    validateProductionConfig();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
