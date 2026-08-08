/**
 * A minimal chat input modal rendered as raw DOM over the Phaser canvas. Phaser's DOM container
 * is not enabled, so this appends its own fixed overlay to document.body and cleans itself up.
 *
 * The full-screen backdrop swallows pointer events (so clicks can't cast through it), and the
 * input stops keydown propagation (so typed keys never reach the window-level movement/hotkey
 * listeners). keyup is intentionally left to bubble so no physical key gets stuck "down".
 */
export class ChatInputOverlay {
  private root?: HTMLDivElement;
  private input?: HTMLInputElement;

  constructor(
    private onSubmit: (text: string) => void,
    private onCancel: () => void
  ) {}

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  open(): void {
    if (this.root) {
      this.input?.focus();
      return;
    }

    const root = document.createElement("div");
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: "12vh",
      background: "rgba(0, 0, 0, 0.45)",
      zIndex: "1000",
      fontFamily: "Roboto Mono, Courier New, monospace"
    } satisfies Partial<CSSStyleDeclaration>);
    root.addEventListener("pointerdown", event => {
      if (event.target === root) {
        this.onCancel();
      }
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      display: "flex",
      gap: "8px",
      padding: "10px",
      background: "#0a0a0a",
      border: "1px solid #444444",
      borderRadius: "6px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)"
    } satisfies Partial<CSSStyleDeclaration>);

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 120;
    input.placeholder = "Say something…";
    Object.assign(input.style, {
      width: "min(60vw, 360px)",
      padding: "8px 10px",
      background: "#161616",
      color: "#f0f0f0",
      border: "1px solid #555555",
      borderRadius: "4px",
      outline: "none",
      fontSize: "14px",
      fontFamily: "inherit"
    } satisfies Partial<CSSStyleDeclaration>);
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.onCancel();
      }
    });

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.textContent = "Send";
    Object.assign(sendButton.style, {
      padding: "8px 14px",
      background: "#ff6600",
      color: "#0a0a0a",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: "bold"
    } satisfies Partial<CSSStyleDeclaration>);
    sendButton.addEventListener("click", () => this.submit());

    panel.append(input, sendButton);
    root.append(panel);
    document.body.append(root);

    this.root = root;
    this.input = input;

    // Defer focus a tick so mobile browsers reliably raise the on-screen keyboard.
    setTimeout(() => this.input?.focus(), 0);
  }

  close(): void {
    if (!this.root) {
      return;
    }

    this.root.remove();
    this.root = undefined;
    this.input = undefined;
  }

  destroy(): void {
    this.close();
  }

  private submit(): void {
    const text = (this.input?.value ?? "").trim();
    if (text.length === 0) {
      this.onCancel();
      return;
    }

    this.onSubmit(text);
  }
}
