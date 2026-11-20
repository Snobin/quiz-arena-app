import { useQuery } from '@tanstack/react-query';
import { searchParam } from '../shell/router.ts';
import { adminT } from './adminI18n.ts';
import { fetchReports, type QuestionDetail } from './api.ts';

/**
 * "Reported: v2 · 3 reports" with the players' notes, above the editor form, when the editor was opened from the
 * Reports page (`?reportedVersion=`). Says so when the reported version is older than the latest published one.
 */
export function ReportBanner({ questionId, versions }: { questionId: string; versions: QuestionDetail['versions'] }) {
  const raw = searchParam('reportedVersion');
  const reported = raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
  const query = useQuery({ queryKey: ['admin', 'reports', 'question', questionId], queryFn: () => fetchReports('OPEN', questionId), enabled: reported !== null, retry: false });
  const group = query.data?.items.find((g) => g.version === reported);
  if (reported === null || !group) return null;
  const current = Math.max(0, ...versions.filter((v) => v.status === 'PUBLISHED').map((v) => v.version));
  return (
    <section aria-label={adminT('reports.bannerNotes')} className="flex flex-col gap-2 rounded-lg border border-hairline bg-card p-3">
      <p className="font-bold">{adminT('reports.banner', { version: reported, count: group.reportCount })}</p>
      {current > reported ? <p>{adminT('reports.bannerOlder', { reported, current })}</p> : null}
      <ul className="flex flex-col gap-1">
        {group.reports.map((report) => (
          <li key={report.reportId} className="whitespace-pre-wrap">
            {report.note ?? adminT('reports.noNote')}
            <span className="text-caption text-muted">
              {' · '}
              {report.reporterName}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
