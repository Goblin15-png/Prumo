import React, { useState } from 'react';
import {
  demoRequestsForCompany, registerDemoCompany, reviewDemoCompany,
  submitDemoDistributorRequest, updateDemoDistributorRequest,
} from './demoDistributorsModel';

const field = 'mt-1 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm';
const button = 'rounded-xl bg-[#5E1A2B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const companyLabels = {pending:'Aguardando análise',approved:'Aprovada na simulação',rejected:'Cadastro rejeitado na simulação'};
const requestLabels = {received:'Recebida',reviewing:'Em análise',answered:'Respondida'};
function RequestCard({ request, company, administrative, onSave }) {
  const [status, setStatus] = useState(request.status);
  const [response, setResponse] = useState(request.response);
  return <article aria-label={`Solicitação ${request.number}`} className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-4 text-sm">
    <h4 className="break-words font-bold">{request.number}{company ? ` · ${company.name}` : ''}</h4>
    <p>Situação: <strong>{requestLabels[request.status]}</strong></p>
    <ul className="space-y-1">{request.items.map((item) => <li key={item.product_id}>{item.quantity}× {item.product_name}</li>)}</ul>
    {request.response && <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3">Retorno simulado: {request.response}</p>}
    {administrative && <form className="space-y-3" onSubmit={(event) => {event.preventDefault();onSave(request.id,status,response);}}>
      <label className="block">Situação de {request.number}<select aria-label={`Situação de ${request.number}`} className={field} value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(requestLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block">Retorno para {request.number}<textarea rows={3} maxLength={2000} required={status === 'answered'} className={field} value={response} onChange={(event) => setResponse(event.target.value)} /></label>
      <button type="submit" className={button}>Salvar retorno simulado</button>
    </form>}
  </article>;
}
export default function DemoDistributors({ state, setState, persona, onPersonaChange, products }) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [companyId, setCompanyId] = useState(1);
  const [quantities, setQuantities] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const company = state.companies.find((item) => item.id === companyId);
  const available = products.filter((item) => item.is_active !== false && Number(item.stock) > 0);
  const apply = (action, message) => {
    setError('');setNotice('');
    try {setState(action(state));setNotice(message);return true;} catch (failure) {setError(failure.message);return false;}
  };
  return <section aria-label="Portal de distribuidores simulado" className="min-w-0 space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-brand-ink">Pruma Essential · laboratório B2B</p><h2 className="mt-2 font-serif text-2xl font-bold text-brand-ink">Distribuidores · demonstração</h2></div>
    <p className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning-ink">Fluxo proposto para validação: cadastro pendente, aprovação manual e solicitação de produtos. Tudo é fictício e fica em memória. Não há login real, cobrança, reserva de estoque ou envio de mensagens.</p>
    <p className="text-sm text-ink-muted">Preços de atacado, quantidade mínima, pagamento, entrega e critérios de aprovação continuam a definir. Os estados desta prévia não são regras comerciais aprovadas.</p>
    <div className="flex flex-wrap gap-2" aria-label="Atalhos de perfil B2B">{[['visitante','Simular cadastro'],['distribuidor','Simular distribuidor'],['admin','Simular lojista']].map(([key,label]) => <button key={key} type="button" className="rounded-lg border border-line-strong px-3 py-2 text-sm" onClick={() => {setError('');setNotice('');onPersonaChange(key);}}>{label}</button>)}</div>
    {error && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success-ink">{notice}</p>}

    {persona === 'visitante' && <form aria-label="Cadastro simulado de empresa" className="max-w-xl space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const nextId = state.nextCompanyId;
      if (apply((current) => registerDemoCompany(current,{name,cnpj}),'Empresa fictícia cadastrada e aguardando análise.')) {setCompanyId(nextId);setName('');setCnpj('');setQuantities({});onPersonaChange('distribuidor');}
    }}>
      <h3 className="font-bold">Cadastro simulado de empresa</h3>
      <label className="block text-sm">Nome da empresa<input required maxLength={180} className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Empresa fictícia de demonstração" /></label>
      <label className="block text-sm">CNPJ de exemplo<input required maxLength={18} autoCapitalize="characters" spellCheck={false} className={field} value={cnpj} onChange={(event) => setCnpj(event.target.value)} placeholder="12.ABC.345/01DE-35" /></label>
      <p className="text-xs text-ink-soft">Aceita formato numérico e alfanumérico. O cálculo confere apenas os dígitos, sem consultar existência ou situação cadastral na Receita.</p>
      <label className="block text-sm">Senha (somente ilustração)<input type="password" readOnly value="demo-sem-login" autoComplete="off" className={field} aria-describedby="demo-b2b-password-note" /></label>
      <p id="demo-b2b-password-note" className="text-xs text-ink-soft">Não digite senhas reais. Este campo é ilustrativo; nenhuma senha é coletada, armazenada ou usada para autenticação.</p>
      <button type="submit" className={button}>Cadastrar empresa fictícia</button>
    </form>}

    {persona === 'cliente' && <p className="rounded-xl bg-surface-muted p-4 text-sm">Cliente varejista e distribuidor são perfis separados. Use os atalhos de simulação para conhecer o fluxo B2B.</p>}

    {persona === 'distribuidor' && <div className="space-y-5">
      <label className="block max-w-xl text-sm">Empresa em visualização simulada<select aria-label="Empresa em visualização simulada" className={field} value={companyId} onChange={(event) => {setCompanyId(Number(event.target.value));setQuantities({});setError('');setNotice('');}}>{state.companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <p className="text-sm">Situação do cadastro: <strong>{companyLabels[company?.status]}</strong></p>
      {company?.status !== 'approved' ? <p className="rounded-xl bg-surface-muted p-4 text-sm">{company?.status === 'rejected' ? 'Nesta proposta, o cadastro rejeitado não pode enviar solicitações.' : 'Aguarde a análise do lojista fictício para solicitar produtos.'}</p> : <form aria-label="Solicitação simulada de produtos" className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const lines = Object.entries(quantities).filter(([,quantity]) => quantity !== '' && quantity !== '0').map(([id,quantity]) => ({product_id:Number(id),quantity:Number(quantity)}));
        if (apply((current) => submitDemoDistributorRequest(current,persona,companyId,lines,products),'Solicitação fictícia recebida. Nenhum pedido de compra foi criado.')) setQuantities({});
      }}>
        <h3 className="font-bold">Produtos disponíveis · solicitação sem pagamento</h3>
        {!available.length && <p className="text-sm text-ink-soft">Nenhum blend disponível neste cenário.</p>}
        <div className="grid gap-3 sm:grid-cols-2">{available.map((product) => <div key={product.id} className="min-w-0 rounded-xl border border-line p-4"><h4 className="font-semibold">{product.name}</h4><p className="mt-1 text-xs text-ink-soft">Produto fictício · valores de atacado a definir</p><label className="mt-3 block text-sm">Quantidade de {product.name}<input type="number" min={0} step={1} className={field} value={quantities[product.id] ?? ''} onChange={(event) => setQuantities((current) => ({...current,[product.id]:event.target.value}))} /></label></div>)}</div>
        <button type="submit" disabled={!available.length} className={button}>Enviar solicitação fictícia</button>
      </form>}
      <section aria-label="Histórico B2B simulado" className="space-y-3"><h3 className="font-bold">Minhas solicitações fictícias</h3>{demoRequestsForCompany(state,companyId).map((request) => <RequestCard key={`${request.id}-${request.status}-${request.response}`} request={request} />)}{!demoRequestsForCompany(state,companyId).length && <p className="text-sm text-ink-soft">Esta empresa não tem solicitações na demonstração.</p>}</section>
    </div>}

    {persona === 'admin' && <div className="space-y-6">
      <section aria-label="Análise simulada de empresas" className="space-y-3"><h3 className="font-bold">Empresas para análise</h3>{state.companies.map((item) => <article key={item.id} aria-label={`Empresa ${item.name}`} className="min-w-0 space-y-2 rounded-xl border border-line p-4 text-sm"><h4 className="break-words font-semibold">{item.name}</h4><p className="break-all">CNPJ de exemplo: {item.cnpj}</p><p>{companyLabels[item.status]}</p>{item.status === 'pending' && <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => apply((current) => reviewDemoCompany(current,persona,item.id,'approved'),'Empresa aprovada apenas na simulação.')}>Aprovar empresa fictícia</button><button type="button" className="rounded-xl border border-danger-line px-4 py-2 text-danger-ink" onClick={() => apply((current) => reviewDemoCompany(current,persona,item.id,'rejected'),'Empresa rejeitada apenas na simulação.')}>Rejeitar empresa fictícia</button></div>}</article>)}</section>
      <section aria-label="Solicitações recebidas na simulação" className="space-y-3"><h3 className="font-bold">Solicitações recebidas</h3>{state.requests.map((request) => <RequestCard key={`${request.id}-${request.status}-${request.response}`} request={request} company={state.companies.find((item) => item.id === request.company_id)} administrative onSave={(id,status,response) => apply((current) => updateDemoDistributorRequest(current,persona,id,status,response),'Retorno salvo somente na simulação.')} />)}{!state.requests.length && <p className="text-sm text-ink-soft">Nenhuma solicitação fictícia recebida.</p>}</section>
    </div>}
  </section>;
}
