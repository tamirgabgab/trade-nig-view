import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

/**
 * The user's own chart background image, as a JPEG data URL shrunk on upload (about 0.2-0.5 MB:
 * well inside localStorage). It stays in this browser; nothing is sent anywhere.
 */
export const useBackdropImageStore = create<{
  image: string | null;
  setImage: (image: string | null) => void;
}>()(
  persist(
    (set) => ({
      image: null,
      setImage: (image) => {
        set({ image });
      },
    }),
    {
      name: 'chartlab.backdropImage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ image: s.image }),
      merge: (persisted, current) => {
        const image = isRecord(persisted) ? persisted['image'] : null;
        return {
          ...current,
          image: typeof image === 'string' && image.startsWith('data:image/') ? image : null,
        };
      },
    },
  ),
);

/** Longest side of a stored background image, px. */
const MAX_SIDE = 1920;

/** A picked image file shrunk to at most 1920 px and re-encoded as a JPEG data URL. */
export async function shrinkImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('no canvas');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
