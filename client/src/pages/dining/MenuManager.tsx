import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { money } from '../../lib/format';
import { qs } from '../../lib/api';
import type { MenuCategory, MenuItem, Outlet } from '../../lib/types';
import { Drawer, Field, Loading, PageHead, Stamp, useConfirm } from '../../components/ui';
import { photo } from '../../lib/img';

export function MenuManager({ outlet }: { outlet: Outlet }) {
  const cats = useApi<MenuCategory[]>(`/menu/categories${qs({ outlet })}`);
  const items = useApi<MenuItem[]>(`/menu/items${qs({ outlet, all: 1 })}`);
  const [edit, setEdit] = useState<MenuItem | 'new' | null>(null);
  const [newCat, setNewCat] = useState('');
  const inv = ['/menu'];
  const toggle = useAction<{ id: number; available: number }>('patch', (b) => `/menu/items/${b.id}`, { invalidate: inv });
  const addCat = useAction('post', '/menu/categories', { invalidate: inv, success: 'Category added', onSuccess: () => setNewCat('') });

  if (cats.isLoading || items.isLoading) return <Loading />;
  const venue = outlet === 'restaurant' ? 'venue-dining' : 'venue-roof';

  return (
    <div className={venue}>
      <PageHead
        eyebrow={outlet === 'restaurant' ? 'Ember & Salt · Menu' : 'Skydeck · Bar menu'}
        title={outlet === 'restaurant' ? 'À la' : 'The bar'}
        accent={outlet === 'restaurant' ? 'carte' : 'list'}
        actions={
          <button className="btn venue" onClick={() => setEdit('new')}>
            <Plus size={15} /> New item
          </button>
        }
      />

      <div className="toolbar">
        <input className="input" style={{ width: 220 }} placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button className="btn ghost" disabled={!newCat.trim()} onClick={() => addCat.mutate({ outlet, name: newCat })}>
          Add category
        </button>
        <span className="grow" />
        <span className="small muted">Toggle “available” to 86 an item — it greys out on every POS instantly.</span>
      </div>

      <div className="stack loose">
        {cats.data?.map((c) => {
          const list = (items.data ?? []).filter((i) => i.category_id === c.id);
          return (
            <section key={c.id}>
              <div className="floor-title">
                <h3>{c.name}</h3>
                <span className="small muted">{list.length} items</span>
              </div>
              <div className="panel">
                <div className="table-wrap">
                  <table className="ledger-table">
                    <tbody>
                      {list.map((i) => (
                        <tr key={i.id} className="clickable" onClick={() => setEdit(i)}>
                          <td>
                            <div className="row">
                              {i.image_url ? <img className="menu-thumb" src={photo(i.image_url, 120)} alt="" /> : <span className="menu-thumb" />}
                              <span>
                                <b>{i.name}</b>
                                <div className="small muted">{i.description}</div>
                              </span>
                            </div>
                          </td>
                          <td style={{ width: 90 }}>
                            <Stamp tone={i.station === 'bar' ? 'roof' : 'dining'}>{i.station}</Stamp>
                          </td>
                          <td className="num" style={{ width: 130 }}>
                            {money(i.price)}
                          </td>
                          <td style={{ width: 130 }} onClick={(e) => e.stopPropagation()}>
                            <label className="check">
                              <input type="checkbox" checked={!!i.available} onChange={(e) => toggle.mutate({ id: i.id, available: e.target.checked ? 1 : 0 })} />
                              {i.available ? 'available' : <span style={{ color: 'var(--bad)' }}>86’d</span>}
                            </label>
                          </td>
                        </tr>
                      ))}
                      {list.length === 0 && (
                        <tr>
                          <td className="muted">No items in this category yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <ItemDrawer key={edit === 'new' ? 'new' : edit?.id ?? 'none'} item={edit} onClose={() => setEdit(null)} outlet={outlet} cats={cats.data ?? []} />
    </div>
  );
}

function ItemDrawer({ item, onClose, outlet, cats }: { item: MenuItem | 'new' | null; onClose: () => void; outlet: Outlet; cats: MenuCategory[] }) {
  const isNew = item === 'new';
  const src = isNew || !item ? null : item;
  const [f, setF] = useState({
    name: src?.name ?? '',
    description: src?.description ?? '',
    price: src?.price ?? 0,
    category_id: src?.category_id ?? cats[0]?.id ?? 0,
    station: src?.station ?? (outlet === 'rooftop' ? 'bar' : 'kitchen'),
    available: src?.available ?? 1,
    image_url: src?.image_url ?? '',
  });
  const inv = ['/menu'];
  const create = useAction('post', '/menu/items', { invalidate: inv, success: 'Item added to menu', onSuccess: onClose });
  const save = useAction('patch', `/menu/items/${src?.id}`, { invalidate: inv, success: 'Item saved', onSuccess: onClose });
  const remove = useAction('del', `/menu/items/${src?.id}`, { invalidate: inv, success: 'Item removed', onSuccess: onClose });
  const confirm = useConfirm();
  if (!item) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={outlet === 'restaurant' ? 'Ember & Salt' : 'Skydeck'}
      title={isNew ? 'New menu item' : f.name}
      footer={
        <>
          {!isNew && (
            <button className="btn quiet" onClick={() => confirm.ask('Remove from menu?', 'Past orders keep their history.', () => remove.mutate({}), true)}>
              Remove
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue" disabled={!f.name || !f.category_id} onClick={() => (isNew ? create.mutate({ ...f, outlet }) : save.mutate(f))}>
            Save
          </button>
        </>
      }
    >
      <div className="grid-2">
        {f.image_url && <img className="photo-preview span-2" src={photo(f.image_url, 700)} alt={f.name} />}
        <Field label="Name" className="span-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Photo link" className="span-2" hint="Paste an https:// link to a photo of this dish (your own photo, or an image host). Shown on the website and the till.">
          <input value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value.trim() })} placeholder="https://…" />
        </Field>
        <Field label="Description" className="span-2">
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Price">
          <input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
        </Field>
        <Field label="Category">
          <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: Number(e.target.value) })}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prep station">
          <select value={f.station} onChange={(e) => setF({ ...f, station: e.target.value as 'kitchen' | 'bar' })}>
            <option value="kitchen">Kitchen</option>
            <option value="bar">Bar</option>
          </select>
        </Field>
        <Field label="Availability">
          <select value={f.available} onChange={(e) => setF({ ...f, available: Number(e.target.value) })}>
            <option value={1}>Available</option>
            <option value={0}>86’d (unavailable)</option>
          </select>
        </Field>
      </div>
      {confirm.element}
    </Drawer>
  );
}
