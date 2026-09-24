/* eslint-disable @next/next/no-img-element */
// Payload admin branding: the login screen logo and the nav icon.
export const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <img src="/brand/mark.svg" alt="" width={48} height={48} />
    <span style={{ fontSize: 28, fontWeight: 700 }}>Chipperly</span>
  </div>
);

export const Icon = () => <img src="/brand/mark.svg" alt="Chipperly" width={24} height={24} />;
