import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vitalview-theme';

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** Follow the system theme until the user picks one, then remember that choice. */
export function useTheme() {
  const [theme, setTheme] = useState(
    () => storedTheme() ?? (darkQuery()?.matches ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const follow = (e) => {
      if (!storedTheme()) setTheme(e.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, file://); the choice then lasts for this visit.
    }
    setTheme(next);
  }

  return [theme, toggle];
}
