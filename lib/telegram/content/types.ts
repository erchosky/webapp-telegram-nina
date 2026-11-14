/**
 * Shape of the user-facing copy for the Mini App. Every visible string lives
 * here (never hardcoded in components) so all three locales stay in sync.
 */
export interface Messages {
  appName: string;
  common: {
    loading: string;
    retry: string;
    genericError: string;
    notInTelegram: string;
    days: string;
    daysOne: string;
    copy: string;
    copied: string;
    close: string;
    continue: string;
  };
  nav: {
    home: string;
    access: string;
    marketplace: string;
    contact: string;
    account: string;
    status: string;
    renew: string;
    invite: string;
    help: string;
  };
  status: {
    title: string;
    heroTitle: string;
    heroSubtitle: string;
    noSubscription: string;
    noSubscriptionHint: string;
    noSubscriptionAction: string;
    active: string;
    activeHint: string;
    pending: string;
    pendingTitle: string;
    pendingHint: string;
    pendingSince: string;
    needsReview: string;
    expired: string;
    expiredHint: string;
    cancelled: string;
    expiresOn: string;
    expiredOn: string;
    daysLeft: (n: number) => string;
    expiresToday: string;
    streakTitle: string;
    streakValue: (months: number) => string;
    streakNone: string;
    nextStepTitle: string;
    accessTitle: string;
    viewInvite: string;
  };
  renew: {
    title: string;
    intro: string;
    stepsTitle: string;
    steps: string[];
    instructionsTitle: string;
    noInstructions: string;
    contactAdmin: string;
    contactInvalid: string;
    contactPreview: (url: string) => string;
    requestButton: string;
    requesting: string;
    requested: string;
    requestedHint: string;
    alreadyRequested: string;
    manualFlowTitle: string;
    manualFlowCopy: string;
  };
  invite: {
    title: string;
    intro: string;
    detailTitle: string;
    singleUseHint: string;
    none: string;
    noneHint: string;
    expiresOn: string;
    revoked: string;
    revokedHint: string;
    used: string;
    usedHint: string;
    expired: string;
    expiredHint: string;
    inactiveTitle: string;
    inactiveHint: string;
    openLink: string;
    requestNew: string;
    localOpened: (url: string) => string;
  };
  help: {
    title: string;
    intro: string;
    rulesTitle: string;
    rules: string[];
    howItWorksTitle: string;
    howItWorks: string[];
    sections: { title: string; body: string }[];
    supportTitle: string;
    supportCopy: string;
  };
  dev: {
    label: string;
    simulated: string;
    scenarioLabels: Record<string, string>;
    apiError: string;
  };
}
