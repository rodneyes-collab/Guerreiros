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
    try {
      const result = await factory();
      return result;
    } catch (error) {
      console.error('[safeLazy] Error loading module:', error);
      
      const isDynamicImportError = 
        error instanceof Error && 
        (error.message.includes('Failed to fetch dynamically imported module') ||
         error.message.includes('Importing a shadowed module') ||
         error.message.includes('error loading dynamically imported module') ||
         error.message.includes('chunk') ||
         error.name === 'ChunkLoadError');

      if (isDynamicImportError) {
        console.warn('[safeLazy] Dynamic import failed. Forcing immediate recovery...');
        
        // Return a component that forces the update on mount as a fallback
        return {
          default: (() => {
            // Use the statically imported function to trigger the update
            forceAppUpdate();
            return null; // Render nothing while reloading
          }) as unknown as T
        };
      }
      
      throw error;
    }
  });
}
