/** Delay before a hover menu closes so the pointer can cross the button-to-menu gap. */
export const HOVER_MENU_CLOSE_DELAY_MS = 220;

export type HoverMenuCloser = {
  schedule: (close: () => void) => void;
  cancel: () => void;
  dispose: () => void;
};

export function createHoverMenuCloser(delayMs = HOVER_MENU_CLOSE_DELAY_MS): HoverMenuCloser {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(close: () => void) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        close();
      }, delayMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
