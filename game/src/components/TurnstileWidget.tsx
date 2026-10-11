import { useEffect, useRef } from 'react';

type TurnstileWidgetOptions = {
  sitekey: string;
  action: 'create_room';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileWidgetOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
  onReady?: () => void;
}

export default function TurnstileWidget({ siteKey, resetKey, onToken }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let widgetId: string | undefined;
    const render = () => {
      if (!window.turnstile || !container.current || widgetId) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action: 'create_room',
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current('')
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-3eal-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset['3ealTurnstile'] = 'true';
      script.addEventListener('load', render);
      document.head.append(script);
    } else {
      // Script element already exists, add listener only if we haven't already
      if (!script['data-3eal-turnstile-has-listener']) {
        script.addEventListener('load', render);
        script['data-3eal-turnstile-has-listener'] = true;
      }
      // If Turnstile is already loaded, render immediately
      if (window.turnstile) {
        render();
      }
    }
    return () => {
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      // Note: We don't remove the listener here to avoid complexity with tracking
      // the function reference. Leaving it is harmless due to early returns in render().
    };
  }, [siteKey, resetKey]);

  return <div ref={container} className="flex min-h-[66px] justify-center" aria-label="Room creation verification" />;
}
