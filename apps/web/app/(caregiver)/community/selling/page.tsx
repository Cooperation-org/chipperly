import type { Metadata } from 'next';
import { SellerSetup } from '@/components/community/SellerSetup';
import { GuestGate } from '@/components/auth/GuestGate';

export const metadata: Metadata = {
  title: 'Selling in the community',
  robots: { index: false, follow: false },
};

export default function SellingPage() {
  return <GuestGate><SellerSetup /></GuestGate>;
}
