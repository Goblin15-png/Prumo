import React, { useEffect, useState } from 'react';

export default function AdminComplaintsManager({ service, onChanged, refreshKey = 0 }) {
  const [complaints, setComplaints] = useState([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try { const { data } = await service.get('/admin/taxonomy'); setComplaints(data.symptoms || []); setError(''); }
    catch { setError('Não foi possível carregar as queixas.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [service, refreshKey]);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (editing) await service.put(`/admin/symptoms/${editing.id}`, { name: name.trim() });
      else await service.post('/admin/symptoms', { name: name.trim() });
      setName(''); setEditing(null); await load(); onChanged?.();
      setNotice('Queixa salva. A opção está disponível no formulário do cliente e nos alvos dos blends.');
    } catch (err) { setError(err.response?.data?.errors?.name?.[0] || err.response?.data?.message || 'Não foi possível salvar a queixa.'); }
    finally { setSaving(false); }
  };
  const remove = async (complaint) => {
    if (!window.confirm(`Excluir a queixa "${complaint.name}" das opções? Ela será removida dos alvos dos blends. Respostas anteriores dos clientes serão preservadas.`)) return;
    setSaving(true); setNotice('');
    try { await service.delete(`/admin/symptoms/${complaint.id}`); if (editing?.id === complaint.id) { setEditing(null); setName(''); } await load(); onChanged?.(); setNotice('Queixa removida das opções.'); }
    catch (err) { setError(err.response?.data?.message || 'Não foi possível excluir a queixa.'); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
    <h2 className="font-serif text-xl font-bold text-brand-ink">Queixas e públicos-alvo</h2>
    <p className="text-sm text-ink-muted">Cadastre o que as pessoas relatam sentir, como ansiedade, estresse ou dificuldade para dormir. O cliente escolhe uma queixa principal no questionário; um blend pode ter várias dessas queixas como alvos. Categorias organizam produtos em outra área.</p>
    <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1 text-xs font-semibold">Nome da queixa
        <input aria-label="Nome da queixa" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ansiedade" className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm" />
      </label>
      <button type="submit" disabled={saving || loading} className="self-end rounded-lg bg-[#5E1A2B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando…' : editing ? 'Salvar queixa' : 'Criar queixa'}</button>
      {editing && <button type="button" onClick={() => { setEditing(null); setName(''); }} className="self-end px-3 py-2 text-sm">Cancelar edição</button>}
    </form>
    {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    {notice && <p role="status" className="text-sm text-success-ink">{notice}</p>}
    {loading && <p role="status" className="text-sm text-ink-soft">Carregando queixas…</p>}
    {!loading && !error && !complaints.length && <p className="text-sm text-ink-soft">Nenhuma queixa cadastrada. Use Criar queixa para começar.</p>}
    <ul className="divide-y divide-line-muted">{complaints.map((complaint) => <li key={complaint.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>{complaint.name}</span><div className="flex gap-2">
        <button type="button" disabled={saving} aria-label={`Editar queixa ${complaint.name}`} onClick={() => { setEditing(complaint); setName(complaint.name); setNotice(''); }} className="rounded-lg border px-3 py-2 text-xs">Editar</button>
        <button type="button" disabled={saving} aria-label={`Excluir queixa ${complaint.name}`} onClick={() => remove(complaint)} className="rounded-lg border border-danger-line px-3 py-2 text-xs text-danger-ink">Excluir</button>
      </div>
    </li>)}</ul>
  </section>;
}
