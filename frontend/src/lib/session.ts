/** Remove authentication state without deleting queued user work or preferences. */
export function clearSession(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem('resq_token');
  storage.removeItem('resq_user');
}
