'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTINE_TEMPLATES, TEMPLATE_CATEGORIES, type RoutineTemplate } from '@chipperly/shared/constants/templates';
import { Picture } from '@/components/media/Picture';
import { ListRow } from '@/components/ui/ListRow';
import { BigButton } from '@/components/ui/BigButton';
import { useSheet } from '@/components/ui/Sheet';
import { useActiveProfile } from '@/lib/profile/active';
import { addTemplate } from '@/lib/data/templates';
import { toast } from '@/lib/toast';
import styles from './TemplateSheet.module.css';

const stepLabel = (n: number) => `${n} step${n === 1 ? '' : 's'}`;

/** Sheet content: the built-in templates grouped by category. Tapping one opens its steps. */
export function TemplateList() {
  const { open } = useSheet();
  return (
    <div className={styles.list}>
      {TEMPLATE_CATEGORIES.map((category) => (
        <section key={category}>
          <h3 className={styles.sectionLabel}>{category}</h3>
          {ROUTINE_TEMPLATES.filter((t) => t.category === category).map((template) => (
            <ListRow
              key={template.key}
              tile={<Picture emoji={template.emoji} photo_id={null} name={template.name} size="list" />}
              name={template.name}
              secondary={`${template.description} ${stepLabel(template.steps.length)}`}
              onTap={() => open(<TemplateDetail template={template} />, { title: template.name })}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function TemplateDetail({ template }: { template: RoutineTemplate }) {
  const router = useRouter();
  const { close } = useSheet();
  const { profile } = useActiveProfile();
  const [saving, setSaving] = useState(false);

  async function add(): Promise<void> {
    if (!profile || saving) return;
    setSaving(true);
    const id = await addTemplate(template, profile.id);
    close();
    toast('Added. Change anything you like.', { carry: true });
    router.push(`/activity/edit/?id=${id}`);
  }

  return (
    <div className={styles.list}>
      <p className={styles.description}>{template.description}</p>
      {template.note ? <p className={styles.note}>{template.note}</p> : null}
      <ol className={styles.steps} aria-label="Steps">
        {template.steps.map((step, i) => (
          <li key={i}>
            <ListRow tile={<Picture emoji={step.emoji} photo_id={null} name={step.name} size="list" />} name={step.name} />
          </li>
        ))}
      </ol>
      <BigButton fullWidth disabled={!profile || saving} onClick={() => void add()}>
        {`Add to ${profile?.name ?? 'profile'}`}
      </BigButton>
    </div>
  );
}
