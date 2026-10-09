export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="empty large loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="empty large" role="alert"><p>{message}</p>{retry && <button className="secondary-button" type="button" onClick={retry}>Try again</button>}</div>;
}
