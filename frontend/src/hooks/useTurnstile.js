import { useRef, useCallback } from 'react';

const SITE_KEY = '1x00000000000000000000AA';

export function useTurnstile() {
  const widgetIdRef = useRef(null);

  const containerRef = useCallback((el) => {
    if (!el || !window.turnstile) return;
    if (el.dataset.turnstileWidget) {
      window.turnstile.reset(el.dataset.turnstileWidget);
      return;
    }
    const id = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      theme: 'light',
    });
    el.dataset.turnstileWidget = id;
    widgetIdRef.current = id;
  }, []);

  const getToken = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      return window.turnstile.getResponse(widgetIdRef.current);
    }
    return '';
  }, []);

  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, []);

  return { containerRef, getToken, reset };
}
