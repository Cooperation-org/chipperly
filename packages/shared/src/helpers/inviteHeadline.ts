/**
 * The invite's first line, for the email and the accept screen. Family and Myself accounts are named after their
 * owner and a supported account after its person, so "Sam invited you to Sam" is said as "to help with Ava" instead.
 */
export function inviteHeadline(inviterName: string, accountName: string, profileNames: readonly string[]): string {
  if (profileNames.length > 0 && (inviterName === accountName || profileNames.includes(accountName))) {
    const list = profileNames.length > 1 ? `${profileNames.slice(0, -1).join(', ')} and ${profileNames[profileNames.length - 1]}` : profileNames[0];
    return `${inviterName} invited you to help with ${list}`;
  }
  return inviterName === accountName ? `${inviterName} invited you to Chipperly` : `${inviterName} invited you to ${accountName}`;
}
