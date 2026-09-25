'use client';

import { useRowLabel } from '@payloadcms/ui';

// Shows each FAQ row by its question in the admin instead of "Question 01".
export const FaqRowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ question?: string }>();
  return <span>{data?.question || `Question ${String((rowNumber ?? 0) + 1).padStart(2, '0')}`}</span>;
};
