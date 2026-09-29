import { ApiError } from "./errors";

/** The simulator writes ordinary workspace records, so it must stay out of production. */
export function requireSimulatorAccess(): void {
  if (process.env.NODE_ENV === "production") {
    throw ApiError.notFound("Not found");
  }
}
