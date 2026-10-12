import styles from './displaySize.module.css';

export type DisplaySize = 'small' | 'medium' | 'large' | 'xl';

/** Classes that set the text and picture scale (B9). Medium adds nothing, so the default look is untouched. */
export function displaySizeClass(s: { text_size?: DisplaySize; picture_size?: DisplaySize }): string {
  const t = s.text_size && s.text_size !== 'medium' ? `${styles.sized} ${styles[`text_${s.text_size}`]}` : '';
  const p = s.picture_size && s.picture_size !== 'medium' ? styles[`pic_${s.picture_size}`] : '';
  return [t, p].filter(Boolean).join(' ');
}
