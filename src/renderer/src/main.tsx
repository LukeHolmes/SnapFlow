import { createRoot } from 'react-dom/client';
import { shouldShowPreloadError } from './runtime';
import './styles.css';

async function boot(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);

  if (shouldShowPreloadError()) {
    const React = await import('react');
    const { default: PreloadError } = await import('./PreloadError');
    root.render(React.createElement(PreloadError));
    return;
  }

  const React = await import('react');
  const { default: App } = await import('./App');
  root.render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  );
}

void boot();
