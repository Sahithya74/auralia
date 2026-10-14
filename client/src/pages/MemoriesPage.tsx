import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { TextArea, Toggle } from '../components/ui/Form';
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from '../components/ui/Icons';
import { Banner, Card, PageShell } from '../components/ui/Layout';
import { Spinner } from '../components/ui/Spinner';
import { useUser } from '../contexts/AuthContext';
import { memoryApi } from '../lib/api/endpoints';
import type { Memory, MemoryCategory } from '../lib/api/types';

const CATEGORIES: MemoryCategory[] = ['PREFERENCE', 'PEOPLE', 'ROUTINE', 'WELLBEING', 'GOAL', 'OTHER'];

export default function MemoriesPage() {
  const { t } = useTranslation();
  const user = useUser();
  const canSave = user.persistence.memories;
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('OTHER');
  const [newSensitive, setNewSensitive] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [toDelete, setToDelete] = useState<Memory | 'all' | null>(null);

  useEffect(() => {
    memoryApi
      .list()
      .then(setMemories)
      .catch(() => setError(true));
  }, []);

  const replace = (m: Memory) => setMemories((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    try {
      const created = await memoryApi.create({ content: newContent.trim(), category: newCategory, sensitive: newSensitive, kind: 'STATED' });
      setMemories((list) => [created, ...(list ?? [])]);
      setNewContent('');
      setNewSensitive(false);
    } catch {
      setError(true);
    }
  }

  async function update(id: string, changes: Parameters<typeof memoryApi.update>[1]) {
    try {
      replace(await memoryApi.update(id, changes));
    } catch {
      setError(true);
    }
  }

  async function confirmDelete() {
    const target = toDelete;
    setToDelete(null);
    try {
      if (target === 'all') {
        await memoryApi.removeAll();
        setMemories([]);
      } else if (target) {
        await memoryApi.remove(target.id);
        setMemories((list) => list?.filter((m) => m.id !== target.id) ?? null);
      }
    } catch {
      setError(true);
    }
  }

  return (
    <PageShell title={t('memories.title')} back="/privacy">
      <p className="text-ink-soft">{t('memories.intro')}</p>
      {error && <Banner tone="error">{t('common.error')}</Banner>}
      {!canSave && (
        <Banner tone="info" action={<Link to="/privacy" className="font-semibold underline">{t('common.privacyCentre')}</Link>}>
          {t('memories.blocked')}
        </Banner>
      )}

      {canSave && (
        <Card>
          <form onSubmit={add} className="flex flex-col gap-3">
            <TextArea label={t('memories.add')} placeholder={t('memories.addPlaceholder')} rows={2} maxLength={500} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                {t('memories.category')}
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="min-h-10 rounded-full border border-line bg-cream-50 px-3"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`memories.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-5 w-5 accent-sage-700" checked={newSensitive} onChange={(e) => setNewSensitive(e.target.checked)} />
                {t('memories.sensitive')}
              </label>
              <Button type="submit" size="sm" icon={<PlusIcon size={18} />} disabled={!newContent.trim()} className="ml-auto">
                {t('memories.add')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {memories === null && !error ? (
        <div className="flex justify-center py-6 text-terracotta-600">
          <Spinner label={t('common.loading')} />
        </div>
      ) : memories && memories.length === 0 ? (
        <p className="py-6 text-center text-ink-soft">{t('memories.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {memories?.map((m) => (
            <li key={m.id}>
              <Card as="article" className={m.enabled ? '' : 'opacity-70'}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-cream-200 px-2.5 py-1 text-ink-soft">{t(`memories.categories.${m.category}`)}</span>
                  <span className={`rounded-full px-2.5 py-1 ${m.kind === 'STATED' ? 'bg-sage-100 text-sage-700' : 'bg-rose-100 text-rose-700'}`}>
                    {m.kind === 'STATED' ? t('memories.stated') : t('memories.interpretation')}
                  </span>
                  {m.sensitive && <span className="rounded-full bg-terracotta-100 px-2.5 py-1 text-terracotta-700">{t('memories.sensitive')}</span>}
                </div>
                {editing?.id === m.id ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing.content.trim()) void update(m.id, { content: editing.content.trim() });
                      setEditing(null);
                    }}
                  >
                    <TextArea label={t('common.edit')} hideLabel rows={2} maxLength={500} value={editing.content} onChange={(e) => setEditing({ id: m.id, content: e.target.value })} />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" icon={<CheckIcon size={16} />}>
                        {t('common.save')}
                      </Button>
                      <Button size="sm" variant="ghost" icon={<CloseIcon size={16} />} onClick={() => setEditing(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-ink">{m.content}</p>
                )}
                <div className="mt-2 flex items-center gap-1">
                  <div className="flex-1">
                    <Toggle label={t('memories.enabled')} checked={m.enabled} disabled={!canSave} onChange={(v) => void update(m.id, { enabled: v })} />
                  </div>
                  {canSave && (
                    <IconButton label={t('common.edit')} onClick={() => setEditing({ id: m.id, content: m.content })}>
                      <EditIcon size={20} />
                    </IconButton>
                  )}
                  <IconButton label={t('common.delete')} onClick={() => setToDelete(m)}>
                    <TrashIcon size={20} />
                  </IconButton>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {memories && memories.length > 0 && (
        <Button variant="ghost" icon={<TrashIcon size={18} />} onClick={() => setToDelete('all')} className="self-center">
          {t('memories.deleteAll')}
        </Button>
      )}

      <Dialog
        open={toDelete !== null}
        title={toDelete === 'all' ? t('memories.deleteAll') : t('memories.deleteConfirm')}
        onClose={() => setToDelete(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {toDelete === 'all' ? t('memories.deleteAllConfirm') : toDelete?.content}
      </Dialog>
    </PageShell>
  );
}
