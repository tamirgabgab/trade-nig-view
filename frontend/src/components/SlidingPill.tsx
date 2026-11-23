import { useLayoutEffect, useRef } from 'react';

import styles from './SlidingPill.module.css';

/**
 * Background "pill" that slides to the pressed button of its parent group (interval, range,
 * scale toggles). Place it as the group's first child; the group needs `position: relative`.
 * It follows `aria-pressed` changes and resizes; with no pressed button it fades out.
 */
export function SlidingPill() {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const group = pill?.parentElement;
    if (!pill || !group) return;
    let placed = false;
    const place = () => {
      const active = group.querySelector<HTMLElement>('[aria-pressed="true"]');
      pill.style.opacity = active ? '1' : '0';
      if (!active) return;
      // First placement jumps; later ones slide.
      pill.dataset['animate'] = String(placed);
      pill.style.width = `${String(active.offsetWidth)}px`;
      pill.style.height = `${String(active.offsetHeight)}px`;
      pill.style.transform = `translate(${String(active.offsetLeft)}px, ${String(active.offsetTop)}px)`;
      placed = true;
    };
    place();
    const mutations = new MutationObserver(place);
    mutations.observe(group, { subtree: true, attributeFilter: ['aria-pressed'] });
    const resizes = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    resizes?.observe(group);
    return () => {
      mutations.disconnect();
      resizes?.disconnect();
    };
  }, []);

  return <span ref={ref} className={styles.pill} aria-hidden="true" />;
}
