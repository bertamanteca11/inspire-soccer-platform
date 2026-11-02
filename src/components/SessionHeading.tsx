import type { AppSession } from '../utils/appTypes';
import { PageTitle } from './ui';

export function SessionHeading({ session, subtitle }: { session: AppSession; subtitle?: string }) {
  const opponent = session.opponent && !session.name.toLocaleLowerCase().includes(session.opponent.toLocaleLowerCase()) ? ` · vs ${session.opponent}` : '';
  return <PageTitle title={`${session.name}${opponent}`} subtitle={subtitle}/>;
}
