import type { Metadata } from 'next';
import { TimerScreen } from '@/components/timer/TimerScreen';

export const metadata: Metadata = {
  title: 'Timer',
  robots: { index: false, follow: false },
};

export default function TimerPage() {
  return <TimerScreen />;
}
