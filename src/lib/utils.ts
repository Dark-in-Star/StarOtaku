import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns undefined rather than throwing on malformed input: callers decode
// optional env vars at module load, where a throw would take down the module.
export function base64ToString(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return atob(value);
  } catch {
    return undefined;
  }
}
