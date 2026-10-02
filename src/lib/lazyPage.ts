import { lazy, type ComponentType } from 'react';

const FLAG = 's3-atlas:chunk-reload';

// After a redeploy, an open tab may request chunk names that no longer exist.
// Reload once to pick up the new index.html instead of showing a blank page.
export function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try {
        sessionStorage.removeItem(FLAG);
      } catch {
        /* storage unavailable */
      }
      return mod;
    } catch (err) {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(FLAG) === '1';
        if (!reloaded) sessionStorage.setItem(FLAG, '1');
      } catch {
        /* storage unavailable */
      }
      if (!reloaded) {
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
