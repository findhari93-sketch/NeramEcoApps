import { describe, it, expect, beforeEach, vi } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return import('./tawk');
}

function tawkScripts() {
  return Array.from(document.querySelectorAll('script#tawk-to-script'));
}

describe('lazy Tawk.to loader', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete (window as any).Tawk_API;
    delete (window as any).Tawk_LoadStart;
    process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID = 'prop123';
    process.env.NEXT_PUBLIC_TAWK_WIDGET_ID = 'widget456';
  });

  it('injects nothing until asked', async () => {
    await freshModule();
    expect(tawkScripts()).toHaveLength(0);
  });

  it('injects the script once, even when asked twice, and resolves on Tawk onLoad', async () => {
    const { loadTawk } = await freshModule();
    const a = loadTawk();
    const b = loadTawk();
    expect(tawkScripts()).toHaveLength(1);
    expect((tawkScripts()[0] as HTMLScriptElement).src).toBe('https://embed.tawk.to/prop123/widget456');

    const api = (window as any).Tawk_API;
    api.maximize = vi.fn();
    api.showWidget = vi.fn();
    api.hideWidget = vi.fn();
    api.onLoad();
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
  });

  it('resolves false without the property or widget id, and injects nothing', async () => {
    delete process.env.NEXT_PUBLIC_TAWK_WIDGET_ID;
    const { loadTawk } = await freshModule();
    await expect(loadTawk()).resolves.toBe(false);
    expect(tawkScripts()).toHaveLength(0);
  });

  it('resolves false when the script fails, and a later tap can retry', async () => {
    const { loadTawk } = await freshModule();
    const first = loadTawk();
    tawkScripts()[0].dispatchEvent(new Event('error'));
    await expect(first).resolves.toBe(false);
    expect(tawkScripts()).toHaveLength(0);
    loadTawk();
    expect(tawkScripts()).toHaveLength(1);
  });

  it('openTawkChat shows and maximizes the widget once loaded', async () => {
    const { openTawkChat } = await freshModule();
    const opened = openTawkChat();
    const api = (window as any).Tawk_API;
    api.maximize = vi.fn();
    api.showWidget = vi.fn();
    api.hideWidget = vi.fn();
    api.onLoad();
    await expect(opened).resolves.toBe(true);
    expect(api.showWidget).toHaveBeenCalled();
    expect(api.maximize).toHaveBeenCalled();
  });

  it('openTawkChat with hideOnMinimize hides the bubble again when the chat is minimized', async () => {
    const { openTawkChat } = await freshModule();
    const opened = openTawkChat({ hideOnMinimize: true });
    const api = (window as any).Tawk_API;
    api.maximize = vi.fn();
    api.showWidget = vi.fn();
    api.hideWidget = vi.fn();
    api.onLoad();
    await opened;
    api.onChatMinimized();
    expect(api.hideWidget).toHaveBeenCalled();
  });
});
