export interface NotesPluginSettings {
  fontSize: number;
  autoSaveDelay: number;
}

export const DEFAULT_NOTES_SETTINGS: NotesPluginSettings = {
  fontSize: 14,
  autoSaveDelay: 1000,
};
