'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { addComment, canDelete, deleteComment, isNicknameRequired, useComments } from '@/lib/data/community';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Byline, LoadState, ReportButton, SignInToJoin, useSignedIn } from './PostCard';
import styles from './CommentList.module.css';

const COMMENT_MAX = 1000;

export function CommentList({ postId }: { postId: string }) {
  const list = useComments(postId);
  const { status, comments, reload } = list;
  const { profile } = useActiveProfile();
  const fieldId = useId();
  const signedIn = useSignedIn();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    setNeedsNickname(false);
    try {
      list.added(await addComment(postId, body, profile?.id));
      setText('');
    } catch (e) {
      if (isNicknameRequired(e)) setNeedsNickname(true);
      else setError("Your comment didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await deleteComment(id);
      list.removed(id);
    } catch {
      toast("Couldn't delete that comment. Try again.");
    }
  }

  return (
    <section className={styles.section} aria-labelledby={`${fieldId}-h`}>
      <h2 id={`${fieldId}-h`} className={styles.heading}>
        Comments
      </h2>
      <LoadState status={status} onRetry={reload}>
        {comments.length === 0 ? (
          <p className={styles.none}>No comments yet.</p>
        ) : (
          <ul className={styles.list}>
            {comments.map((c) => (
              <li key={c.id} className={styles.item}>
                <Byline nickname={c.author.nickname} isSupport={c.author.is_support} avatarEmoji={c.author.avatar_emoji} when={c.created_at} />
                <p className={styles.body}>{c.body}</p>
                <div className={styles.actions}>
                  {canDelete(c.viewer) ? (
                    <Button variant="ghost" icon="trash" onClick={() => void remove(c.id)}>
                      {c.viewer.is_mine ? 'Delete' : 'Remove'}
                    </Button>
                  ) : null}
                  <ReportButton targetType="comment" targetId={c.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.moreFailed ? (
          <p className={styles.notice} role="alert">
            Couldn&apos;t load more comments. Try again.
          </p>
        ) : null}
        {list.hasMore ? (
          <Button variant="secondary" fullWidth loading={list.loadingMore} onClick={() => void list.loadMore()}>
            Load more comments
          </Button>
        ) : null}
      </LoadState>
      {status === 'offline' ? null : !signedIn ? (
        <SignInToJoin what="comment" />
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label="Add a comment" htmlFor={fieldId} error={error ?? undefined}>
            <textarea
              id={fieldId}
              className={styles.textarea}
              rows={3}
              maxLength={COMMENT_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {needsNickname ? (
            <p className={styles.notice} role="alert">
              Pick a community nickname first. <Link href="/settings/community/">Set a nickname</Link>
            </p>
          ) : null}
          <Button type="submit" loading={sending} disabled={text.trim() === ''}>
            Post comment
          </Button>
        </form>
      )}
    </section>
  );
}
