'use client';

import { useId, useState } from 'react';
import { editPost, type CommunityPost } from '@/lib/data/community';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TextField } from '@/components/ui/TextField';
import styles from './PostEditor.module.css';

const TITLE_MAX = 120;
const BODY_MAX = 5000;

/** Edit the title and message of your own post. That is all the API's PATCH allows; the shared story, routine, pictures and price stay as posted. */
export function PostEditor({ post, onSaved, onCancel }: { post: CommunityPost; onSaved: () => void; onCancel: () => void }) {
  const bodyId = useId();
  const [title, setTitle] = useState(post.title ?? '');
  const [body, setBody] = useState(post.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A priced item is listed by its title, and the API refuses to clear it.
  const titleRequired = post.price !== null;
  const changed = title.trim() !== (post.title ?? '') || body.trim() !== (post.body ?? '');

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await editPost(post.id, { title: title.trim() || null, body: body.trim() || null });
      onSaved();
    } catch {
      setError("Your changes didn't save. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label={titleRequired ? 'Title' : 'Title (optional)'}
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Field label="Message" htmlFor={bodyId}>
        <textarea
          id={bodyId}
          className={styles.textarea}
          rows={5}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button type="submit" loading={saving} disabled={!changed || (titleRequired && title.trim() === '')}>
          Save changes
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
