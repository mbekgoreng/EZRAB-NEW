import { useEffect, useState } from 'react';

export interface BrowserLocation {
  pathname: string;
  search: string;
  hash: string;
}

const readLocation = (): BrowserLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

export const useBrowserLocation = () => {
  const [location, setLocation] = useState<BrowserLocation>(readLocation);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('ezrab:navigate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('ezrab:navigate', sync);
    };
  }, []);

  return location;
};
