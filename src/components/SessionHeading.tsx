import type { AppSession } from '../utils/appTypes';
import { PageTitle } from './ui';

export function SessionHeading({ session, subtitle }: { session: AppSession; subtitle?: string }) {
  const opponent = session.opponent && !session.name.toLocaleLowerCase().includes(session.opponent.toLocaleLowerCase()) ? ` · vs ${session.opponent}` : '';
  const state = session.status === 'locked' || session.locked_at != null ? 'Sesión bloqueada' : session.status === 'archived' ? 'Sesión archivada' : '';
  return <PageTitle title={`${session.name}${opponent}`} subtitle={[state,subtitle].filter(Boolean).join(' · ') || undefined}/>;
}
