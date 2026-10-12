import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rqFetch, deviceId } from '../lib/api';
import { readRole } from '../components/RoleSwitcher';
import { SampleDataBadge, StepIndicator } from '../components/primitives';
import { QueueList } from '../components/watch';
import type { Detection } from '../lib/types';

interface DetectionsResponse {
  sample_data: boolean;
  note: string;
  items: Detection[];
}

export function WatchPage() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['watch-detections'],
    queryFn: () => rqFetch<DetectionsResponse>('/api/redesign/detections'),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'verify' | 'dismiss' | 'escalate' }) =>
      rqFetch(`/api/redesign/detections/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action, role: readRole(), device_id: deviceId() }),
      }),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => {
      setBusyId(null);
      void queryClient.invalidateQueries({ queryKey: ['watch-detections'] });
    },
  });

  return (
    <div data-rq-app>
      <StepIndicator current="Detection" />
      <div className="mx-auto max-w-3xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Detection queue</h1>
          <SampleDataBadge note={data?.note} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Satellite and field reports needing a human check. Nothing here is a confirmed fire until someone verifies it.
        </p>

        <div className="mt-5">
          {isLoading && <p className="text-sm text-ink-muted">Loading the triage queue…</p>}
          {isError && <p className="text-sm text-danger">The triage queue could not load.</p>}
          {data && (
            <QueueList
              detections={data.items}
              busyId={busyId}
              onAction={(id, action) => mutation.mutate({ id, action })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
