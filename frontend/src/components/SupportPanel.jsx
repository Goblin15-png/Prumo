import React, { useEffect, useRef, useState } from 'react';

const input = 'w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink';
const button = 'rounded-xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const date = (value) => new Date(String(value).replace(' ', 'T')).toLocaleString('pt-BR');

export default function SupportPanel({ service, administrative = false, canReply = true, canManage = true }) {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const selection = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    service.list(filter, page).then((result) => {
      if (active) { setTickets(result.data); setLastPage(result.last_page); }
    }).catch(() => { if (active) setError('Não foi possível carregar os chamados.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, filter, page, refresh]);

  useEffect(() => {
    const version = ++selection.current;
    setDetail(null);
    setDetailFailed(false);
    if (!selected) return;
    service.show(selected).then((result) => {
      if (selection.current === version) setDetail(result);
    }).catch(() => { if (selection.current === version) { setDetailFailed(true); setError('Não foi possível abrir a conversa. Use Atualizar para tentar novamente.'); } });
    return () => { selection.current++; };
  }, [selected, service, refresh]);

  useEffect(() => { setReply(''); }, [selected]);

  const perform = async (operation, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(message); setRefresh((value) => value + 1); }
    catch (error) { setError(error.response?.data?.message || 'Não foi possível salvar. Seu texto foi mantido para tentar novamente.'); }
    finally { setBusy(false); }
  };

  return <section id={administrative ? 'admin-suporte' : 'distributor-suporte'} className="space-y-5 rounded-3xl border border-line bg-surface p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-serif text-xl font-bold text-brand-ink">{administrative ? 'Painel de suporte' : 'Suporte da loja'}</h2><p className="mt-1 text-sm text-ink-muted">{administrative ? 'Acompanhe e responda aos chamados dos distribuidores.' : 'Converse com a administração e acompanhe as respostas por aqui.'}</p></div>
      <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)} className="rounded-xl border border-line-strong px-4 py-2 text-sm">Atualizar</button>
    </div>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success-ink">{notice}</p>}
    {!administrative && <form className="space-y-3 rounded-2xl border border-line p-4" onSubmit={(event) => {
      event.preventDefault(); perform(async () => { const result = await service.create({ subject, body }); setSubject(''); setBody(''); setSelected(result.id); }, 'Chamado enviado.');
    }}>
      <h3 className="font-semibold">Novo chamado</h3>
      <label className="block text-sm">Assunto<input className={`${input} mt-1`} required maxLength={150} value={subject} onChange={(event) => setSubject(event.target.value)} disabled={busy} /></label>
      <label className="block text-sm">Mensagem<textarea className={`${input} mt-1`} required maxLength={4000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} /></label>
      <button className={button} disabled={busy}>Enviar chamado</button>
    </form>}
    <label className="block max-w-xs text-sm">Filtrar por status<select className={`${input} mt-1`} value={filter} disabled={busy} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="">Todos</option><option value="open">Abertos</option><option value="closed">Encerrados</option></select></label>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="space-y-2">
        {loading ? <p role="status">Carregando chamados…</p> : !tickets.length && <p className="py-4 text-sm text-ink-muted">Nenhum chamado neste filtro.</p>}
        {!loading && tickets.map((ticket) => <button type="button" key={ticket.id} disabled={busy} onClick={() => { setSelected(ticket.id); setError(''); }} aria-pressed={selected === ticket.id} className={`w-full rounded-xl border p-4 text-left ${selected === ticket.id ? 'border-brand-ink bg-brand-ink/5' : 'border-line'}`}>
          <span className="text-xs text-ink-muted">#{ticket.id} · {ticket.status === 'open' ? 'Aberto' : 'Encerrado'}</span>
          <strong className="mt-1 block break-words text-sm">{ticket.subject}</strong>
          {administrative && <span className="block text-xs text-ink-muted">{ticket.distributor_name}</span>}
        </button>)}
        <div className="flex items-center justify-between gap-2 pt-2 text-xs"><button type="button" disabled={page <= 1 || busy || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {lastPage}</span><button type="button" disabled={page >= lastPage || busy || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
      </div>
      <div className="min-w-0 rounded-2xl border border-line p-4">
        {!selected ? <p className="text-sm text-ink-muted">Selecione um chamado para ler a conversa.</p> : detailFailed ? <p className="text-sm text-ink-muted">Conversa indisponível. Tente atualizar.</p> : !detail ? <p role="status">Abrindo conversa…</p> : <>
          <h3 className="break-words font-semibold">#{detail.ticket.id} · {detail.ticket.subject}</h3>
          <div className="my-4 max-h-96 space-y-3 overflow-y-auto" aria-label="Mensagens do chamado">
            {detail.messages.map((message) => <div key={message.id} className={`rounded-xl p-3 ${message.from_admin ? 'bg-brand-ink/10' : 'bg-surface-subtle'}`}>
              <p className="text-xs font-semibold text-brand-ink">{message.from_admin ? 'Administração' : 'Distribuidor'} · {date(message.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
            </div>)}
          </div>
          {detail.ticket.status === 'open' && canReply ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); perform(async () => { await service.reply(selected, reply); setReply(''); }, 'Resposta enviada.'); }}>
            <label className="block text-sm">Sua resposta<textarea className={`${input} mt-1`} rows={3} required maxLength={4000} value={reply} disabled={busy} onChange={(event) => setReply(event.target.value)} /></label>
            <button className={button} disabled={busy}>Enviar resposta</button>
          </form> : <p className="text-sm text-ink-muted">{detail.ticket.status === 'closed' ? 'Chamado encerrado.' : 'Você pode consultar esta conversa.'}</p>}
          {administrative && canManage && <button type="button" disabled={busy} className="mt-4 rounded-xl border border-line-strong px-4 py-2 text-sm" onClick={() => perform(() => service.status(selected, detail.ticket.status === 'open' ? 'closed' : 'open'), 'Status atualizado.')}>
            {detail.ticket.status === 'open' ? 'Encerrar chamado' : 'Reabrir chamado'}
          </button>}
        </>}
      </div>
    </div>
  </section>;
}
