const SCRIPT_URL = "https://accounts.google.com/gsi/client";
let pendingScript: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (pendingScript) return pendingScript;

  pendingScript = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    if (script?.dataset.googleIdentityStatus) {
      script.remove();
      script = null;
    }
    const element = script ?? document.createElement("script");
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener("load", loaded);
      element.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      element.dataset.googleIdentityStatus = "failed";
      reject(new Error("Google sign-in is unavailable"));
    };
    const loaded = () => {
      if (!window.google?.accounts?.oauth2) return failed();
      cleanup();
      element.dataset.googleIdentityStatus = "loaded";
      resolve();
    };
    const timeout = window.setTimeout(failed, 10_000);
    element.addEventListener("load", loaded);
    element.addEventListener("error", failed);
    if (!script) {
      element.src = SCRIPT_URL;
      element.async = true;
      document.head.appendChild(element);
    }
  }).finally(() => {
    pendingScript = null;
  });
  return pendingScript;
}
