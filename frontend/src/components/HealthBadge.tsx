import { useHealth } from '../api/health.ts';
import styles from './BottomBar.module.css';

/** Backend connection indicator (green = API reachable, red = down). */
export function HealthBadge() {
  const { data, isError, isPending } = useHealth();

  let state: 'pending' | 'ok' | 'down' = 'pending';
  let text = 'API …';
  let title = 'Checking backend connection';
  if (isError) {
    state = 'down';
    text = 'API down';
    title = 'Backend is not reachable on /api/health — is the dev server running?';
  } else if (!isPending) {
    state = 'ok';
    text = data.offline ? 'API offline data' : 'API';
    title = `Backend v${data.version}${data.offline ? ' (OFFLINE=1, fixtures only)' : ''}`;
  }

  return (
    <span
      className={[styles.badge, state === 'pending' ? '' : styles[state]].join(' ')}
      role="status"
      title={title}
      data-state={state}
    >
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </span>
  );
}
