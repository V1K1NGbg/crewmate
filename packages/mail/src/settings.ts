export interface GmailPluginSettings {
  maxThreads: number;
  defaultQuery: string;
  mainLanguage: string;
  autoTranslateForeignEmails: boolean;
  suggestionPrecomputeCount: number;
  suggestionActionCount: number;
  quickReviewEnabled: boolean;
  quickReviewToggleKey: string;
  reviewNextActionKey: string;
  reviewPreviousActionKey: string;
  reviewApplyKey: string;
  reviewSkipKey: string;
  reviewApplyOnlyKey: string;
}

export const DEFAULT_GMAIL_SETTINGS: GmailPluginSettings = {
  maxThreads: 20,
  defaultQuery: "is:inbox",
  mainLanguage: "English",
  autoTranslateForeignEmails: true,
  suggestionPrecomputeCount: 5,
  suggestionActionCount: 6,
  quickReviewEnabled: false,
  quickReviewToggleKey: "r",
  reviewNextActionKey: "j",
  reviewPreviousActionKey: "k",
  reviewApplyKey: "e",
  reviewSkipKey: "x",
  reviewApplyOnlyKey: "a",
};
