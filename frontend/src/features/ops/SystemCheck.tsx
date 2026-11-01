import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../app/http';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Page';

type Finding = { level: 'fail' | 'warn' | 'ok'; id: string; title: string; detail: string };
const DOT = { fail: 'bg-danger', warn: 'bg-warn', ok: 'bg-ok' } as const;
const WORD = { fail: 'Needs fixing', warn: 'Check', ok: 'Fine' } as const;

/** One button that checks the settings and the services the site depends on, and says in plain words what is wrong. */
export function SystemCheck() {
  const { t } = useTranslation();
  const [deep, setDeep] = useState(false);
  const [run, setRun] = useState(0);
  const result = useQuery({ queryKey: ['diagnostics', run, deep], enabled: run > 0, retry: false, staleTime: 0,
    queryFn: () => api<{ summary: Record<string, number>; findings: Finding[] }>(`/api/ops/diagnostics${deep ? '?deep=true' : ''}`) });
  return (
    <Card title={t('ops.check.title', 'System check')}>
      <p className="text-sm text-ink-muted">{t('ops.check.help', 'Looks for settings that clash, switches left off, and services that do not answer: the things that otherwise only show up when someone hits them.')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button loading={result.isFetching} onClick={() => setRun(value => value + 1)}>{t('ops.check.run', 'Run the check')}</Button>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={deep} onChange={event => setDeep(event.target.checked)} />{t('ops.check.deep', 'Also check a test photo with the model (slower)')}</label>
      </div>
      {result.isError && <p role="alert" className="mt-3 text-danger">{t('ops.check.failed', 'The check itself could not run. Try again.')}</p>}
      {result.data && (
        <div className="mt-4" data-testid="system-check">
          <p className="font-semibold">{t('ops.check.summary', { fail: result.data.summary.fail, warn: result.data.summary.warn, defaultValue: '{{fail}} to fix, {{warn}} to look at' })}</p>
          <ul className="mt-2 divide-y divide-line rounded-rq border border-line">{result.data.findings.map(item => (
            <li key={item.id} className="flex items-start gap-3 p-3">
              <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[item.level]}`} />
              <div><p className="font-semibold"><span className="sr-only">{WORD[item.level]}: </span>{item.title}</p><p className="text-sm text-ink-muted">{item.detail}</p></div>
            </li>))}</ul>
        </div>)}
    </Card>
  );
}
