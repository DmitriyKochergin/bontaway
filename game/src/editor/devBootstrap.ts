import { EDITOR_MODE_ENABLED } from "../editorMode";
type EditorWindow = Window & { __BONTAWAY_EDITOR_MODE__?: boolean };

export const initializeDevOnlyEditorMode = (): void => {
  if (!EDITOR_MODE_ENABLED) {
    return;
  }

  (window as EditorWindow).__BONTAWAY_EDITOR_MODE__ = true;
};




