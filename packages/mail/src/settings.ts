export interface GmailPluginSettings {
  maxThreads: number;
  defaultQuery: string;
}

export const DEFAULT_GMAIL_SETTINGS: GmailPluginSettings = {
  maxThreads: 20,
  defaultQuery: "is:inbox",
};
