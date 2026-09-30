import type { Metadata } from 'next';
import { SellerSetup } from '@/components/community/SellerSetup';

export const metadata: Metadata = {
  title: 'Selling in the community',
  robots: { index: false, follow: false },
};

export default function SellingPage() {
  return <SellerSetup />;
}
