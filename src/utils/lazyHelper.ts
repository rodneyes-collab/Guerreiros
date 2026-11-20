import { lazy } from 'react';
import { forceAppUpdate } from './forceAppUpdate';

/**
 * A wrapper for React.lazy that handles "Failed to fetch dynamically imported module" errors.
 * This happens when a user has an old version of the app open and tries to navigate
 * to a view whose JS chunk was replaced in a new deployment.
 */
export function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 400 * attempt));
        }
        return await factory();
      } catch (error) {
        lastError = error;
      }
    }

    const isDynamicImportError =
      lastError instanceof Error &&
      (lastError.message.includes('Failed to fetch dynamically imported module') ||
        lastError.message.includes('Importing a shadowed module') ||
        lastError.message.includes('error loading dynamically imported module') ||
        lastError.message.includes('chunk') ||
        lastError.name === 'ChunkLoadError');

    if (isDynamicImportError) {
      console.warn('[safeLazy] Dynamic import failed after retries. Recovering...');
      return {
        default: (() => {
          forceAppUpdate();
          return null;
        }) as unknown as T
      };
    }

    throw lastError;
  });
}
