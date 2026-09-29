import type { Account } from '@chipperly/shared/schemas/account';

/** "Myself" in onboarding creates an `individual` account: the person using the app is the account holder. */
export function isSelfManaged(account: Pick<Account, 'kind'> | undefined): boolean {
  return account?.kind === 'individual';
}

/** Strings that read differently when the person supports someone else vs. manages their own day. */
export function settingsCopy(selfManaged: boolean, name: string) {
  return {
    viewTitle: selfManaged ? 'Your view' : `${name}'s view`,
    viewSaved: selfManaged ? 'Saved your view' : `Saved ${name}'s view`,
    pinIntro: selfManaged
      ? "Set a PIN first. You'll need it to get back from your view."
      : `Set a PIN first. You'll need it to get back from ${name}'s view.`,
    viewIntro: selfManaged
      ? 'What you see and can do. Lock with the lock button at the top.'
      : `What ${name} sees and can do. Lock with the lock button at the top.`,
    seesTitle: selfManaged ? 'What you see' : `What ${name} sees`,
    canTitle: selfManaged ? 'What you can do' : `What ${name} can do`,
    can: (what: string) => (selfManaged ? `You can ${what}` : `${name} can ${what}`),
    rewardToggle: selfManaged ? "Remind me when I'm ready for a reward" : `Alert me when ${name} wants a reward`,
    rewardToggleLabel: selfManaged ? 'Reward reminders' : 'Reward alerts',
    reviewTitle: selfManaged ? 'Remind me to check my routines' : `Remind me to check ${name}’s routines`,
    /** Null: no hint. The "others choose their own" line only makes sense with a team. */
    reviewHint: selfManaged ? null : `Just for you; others supporting ${name} choose their own.`,
  };
}
