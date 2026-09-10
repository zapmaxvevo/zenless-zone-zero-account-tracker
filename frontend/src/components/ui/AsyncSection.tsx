import type { ReactNode } from 'react';
import StatusMessage from '../StatusMessage';

export interface AsyncState {
  loading: boolean;
  error: string | null;
  reload?: () => void;
}

interface AsyncSectionProps {
  state: AsyncState;
  loading: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

export default function AsyncSection({
  state,
  loading,
  empty,
  isEmpty = false,
}: AsyncSectionProps) {
  if (state.loading) return <StatusMessage kind="loading">{loading}</StatusMessage>;

  if (state.error) {
    return (
      <StatusMessage kind="error" onRetry={state.reload}>
        {state.error}
      </StatusMessage>
    );
  }

  if (isEmpty && empty !== undefined) return <StatusMessage kind="empty">{empty}</StatusMessage>;

  return null;
}
