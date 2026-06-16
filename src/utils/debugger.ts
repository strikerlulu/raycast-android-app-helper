// Simple debugging utilities for the extension

export function logDebug(message: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function logError(message: string, error: unknown): void {
  console.error(`[ERROR] ${message}`, error);
}

export function logInfo(message: string, ...args: unknown[]): void {
  console.log(`[INFO] ${message}`, ...args);
}
