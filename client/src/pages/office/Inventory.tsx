import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDateTime, money } from '../../lib/format';
import { qs } from '../../lib/api';
import type { InventoryItem, StockMovement } from '../../lib/types';
import { Chips, Drawer, Field, Ledger, LedgerCell, Loading, Modal, PageHead, Stamp, Tabs } from '../../components/ui';

type Store = 'all' | InventoryItem['store'];
const INV = ['/inventory', '/nav-counts', '/dashboard'];

export function Inventory() {
  const [store, setStore] = useState<Store>('all');
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [tab, setTab] = useState<'stock' | 'log'>('stock');
  const { data, isLoading } = useApi<InventoryItem[]>(`/inventory${qs({ store: store === 'all' ? undefined : store, q, low: low ? 1 : undefined })}`);
  const all = useApi<InventoryItem[]>('/inventory');
  const log = useApi<StockMovement[]>(tab === 'log' ? '/inventory/movements' : null);
  const [move, setMove] = useState<InventoryItem | null>(null);
  const [edit, setEdit] = useState<InventoryItem | 'new' | null>(null);

  const items = all.data ?? [];
  const value = items.reduce((s, i) => s + i.qty * i.cost, 0);
  const lowCount = items.filter((i) => i.qty <= i.par_level).length;
  const out = items.filter((i) => i.qty <= 0).length;

  return (
    <div className="venue-office">
      <PageHead
        eyebrow="Back office · Stores"
        title="Inventory"
        actions={
          <button className="btn" onClick={() => setEdit('new')}>
            <Plus size={15} /> New stock item
          </button>
        }
      />
      <Ledger cols={4}>
        <LedgerCell label="Stock lines" value={items.length} />
        <LedgerCell label="Stock value" value={money(value, { compact: true })} sub="at cost" />
        <LedgerCell label="At or below par" value={lowCount} sub="reorder now" />
        <LedgerCell label="Out of stock" value={out} />
      </Ledger>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stock', label: 'Stock on hand' },
          { value: 'log', label: 'Movement log' },
        ]}
      />

      {tab === 'stock' ? (
        <>
          <div className="toolbar">
            <Chips
              value={store}
              onChange={setStore}
              options={[
                { value: 'all', label: 'All stores' },
                { value: 'kitchen', label: 'Kitchen' },
                { value: 'bar', label: 'Bar' },
                { value: 'housekeeping', label: 'Housekeeping' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
            />
            <label className="check">
              <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only
            </label>
            <span className="grow" />
            <label className="search">
              <Search size={15} />
              <input placeholder="Item or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <div className="panel">
            {isLoading ? (
              <Loading />
            ) : (
              <div className="table-wrap">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Store</th>
                      <th className="num">On hand</th>
                      <th className="num">Par</th>
                      <th style={{ width: 140 }}>Level</th>
                      <th className="num">Unit cost</th>
                      <th>Supplier</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.map((i) => {
                      const ratio = i.par_level ? i.qty / (i.par_level * 2) : 1;
                      const tone = i.qty <= 0 ? 'var(--bad)' : i.qty <= i.par_level ? 'var(--warn)' : 'var(--ok)';
                      return (
                        <tr key={i.id} className="clickable" onClick={() => setEdit(i)}>
                          <td>
                            <b>{i.name}</b>
                            <div className="small muted mono">{i.sku}</div>
                          </td>
                          <td>
                            <Stamp tone={{ kitchen: 'dining', bar: 'roof', housekeeping: 'hotel', maintenance: 'neutral' }[i.store]}>{i.store}</Stamp>
                          </td>
                          <td className="num strong" style={{ color: tone }}>
                            {i.qty} <span className="small muted">{i.unit}</span>
                          </td>
                          <td className="num">{i.par_level}</td>
                          <td>
                            <div className="progress">
                              <i style={{ width: `${Math.min(100, ratio * 100)}%`, background: tone }} />
                            </div>
                          </td>
                          <td className="num">{money(i.cost)}</td>
                          <td className="small">{i.supplier ?? '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button className="btn sm ghost" onClick={() => setMove(i)}>
                              Move stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="panel">
          {log.isLoading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Item</th>
                    <th>Reason</th>
                    <th className="num">Change</th>
                    <th>Note</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data?.map((m) => (
                    <tr key={m.id}>
                      <td className="nowrap small">{fmtDateTime(m.created_at)}</td>
                      <td>{m.item_name}</td>
                      <td>
                        <Stamp tone={m.reason === 'purchase' ? 'ok' : m.reason === 'wastage' ? 'bad' : m.reason === 'usage' ? 'info' : 'neutral'}>{m.reason}</Stamp>
                      </td>
                      <td className="num strong" style={{ color: m.change < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                        {m.change > 0 ? '+' : ''}
                        {m.change} {m.unit}
                      </td>
                      <td className="small italic">{m.note}</td>
                      <td className="small">{m.user_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <MoveModal item={move} onClose={() => setMove(null)} />
      <ItemDrawer key={edit === 'new' ? 'new' : edit?.id ?? 'x'} item={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function MoveModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const [reason, setReason] = useState('purchase');
  const [qty, setQty] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const mv = useAction('post', `/inventory/${item?.id}/movements`, {
    invalidate: INV,
    success: 'Stock updated',
    onSuccess: () => {
      onClose();
      setQty('');
      setNote('');
    },
  });
  const sign = reason === 'purchase' ? 1 : reason === 'adjustment' ? 1 : -1;
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={`Move stock · ${item?.name ?? ''}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!qty || mv.isPending} onClick={() => mv.mutate({ reason, change: sign * Number(qty), note })}>
            Record
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          On hand: <b className="mono">{item?.qty} {item?.unit}</b>
        </p>
        <Field label="Movement">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="purchase">Delivery / purchase (+)</option>
            <option value="usage">Issued to outlet (−)</option>
            <option value="wastage">Wastage / breakage (−)</option>
            <option value="adjustment">Stock-take adjustment (±)</option>
          </select>
        </Field>
        <Field label={`Quantity (${item?.unit ?? ''})`} hint={reason === 'adjustment' ? 'Use a negative number to reduce.' : undefined}>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice no., reason…" />
        </Field>
      </div>
    </Modal>
  );
}

function ItemDrawer({ item, onClose }: { item: InventoryItem | 'new' | null; onClose: () => void }) {
  const src = item && item !== 'new' ? item : null;
  const [f, setF] = useState({
    name: src?.name ?? '',
    sku: src?.sku ?? '',
    store: src?.store ?? 'kitchen',
    unit: src?.unit ?? 'kg',
    par_level: src?.par_level ?? 10,
    cost: src?.cost ?? 0,
    supplier: src?.supplier ?? '',
    qty: 0,
  });
  const create = useAction('post', '/inventory', { invalidate: INV, success: 'Stock item added', onSuccess: onClose });
  const save = useAction('patch', `/inventory/${src?.id}`, { invalidate: INV, success: 'Saved', onSuccess: onClose });
  if (!item) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Stores"
      title={src ? src.name : 'New stock item'}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!f.name} onClick={() => (src ? save.mutate(f) : create.mutate(f))}>
            Save
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Name" className="span-2">
          <input value={f.name} onChange={set('name')} />
        </Field>
        <Field label="SKU">
          <input value={f.sku} onChange={set('sku')} placeholder="auto if blank" />
        </Field>
        <Field label="Store">
          <select value={f.store} onChange={set('store')}>
            <option value="kitchen">Kitchen</option>
            <option value="bar">Bar</option>
            <option value="housekeeping">Housekeeping</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Unit">
          <input value={f.unit} onChange={set('unit')} />
        </Field>
        <Field label="Par level">
          <input type="number" value={f.par_level} onChange={set('par_level')} />
        </Field>
        <Field label="Unit cost">
          <input type="number" value={f.cost} onChange={set('cost')} />
        </Field>
        {!src && (
          <Field label="Opening quantity">
            <input type="number" value={f.qty} onChange={set('qty')} />
          </Field>
        )}
        <Field label="Supplier" className="span-2">
          <input value={f.supplier} onChange={set('supplier')} />
        </Field>
      </div>
      {src && <p className="small muted">Quantity changes go through “Move stock” so every unit is accounted for.</p>}
    </Drawer>
  );
}
