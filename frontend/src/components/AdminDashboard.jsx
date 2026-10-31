import React, { useState, useEffect, useMemo } from 'react';
import { adminApi as api } from '../services/api';
import AdminCatalogManager from './AdminCatalogManager';
import AdminCategoryManager from './AdminCategoryManager';
import AdminComplaintsManager from './AdminComplaintsManager';
import AdminAudienceReport from './AdminAudienceReport';
import AdminOrderManager from './AdminOrderManager';
import { createOrderFulfillmentService } from '../services/orderFulfillmentService';
import { 
  Sparkles, 
  BarChart3, 
  PlusCircle, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  Bot, 
  BookOpen, 
  RefreshCw 
} from 'lucide-react';

export default function AdminDashboard({ user, onOpenProductForm, onEditProduct, onProductsChanged, onProductDeleted, onCategoriesChanged, catalogRefreshKey }) {
  const permissions = user?.admin_permissions || [];
  const can = (permission) => permissions.includes(permission);
  const orderWorkflow = useMemo(() => createOrderFulfillmentService(api), []);
  const [systemStatus, setSystemStatus] = useState(null);
  const [systemError, setSystemError] = useState('');
  const [taxonomyRefresh, setTaxonomyRefresh] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (can('health.view')) fetchMetrics();
    if (can('system.view')) {
      api.get('/admin/system-status').then(({ data }) => setSystemStatus(data)).catch(() => setSystemError('Não foi possível verificar os serviços.'));
    }
  }, [user?.id, user?.admin_profile]);

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    setMetricsError('');
    try {
      const res = await api.get('/admin/health-metrics');
      setMetrics(res.data);
    } catch {
      setMetrics(null);
      setMetricsError('Não foi possível carregar métricas reais do servidor.');
    } finally {
      setLoadingMetrics(false);
    }
  };

  const handleGenerateAiInsights = async () => {
    setLoadingAi(true);
    setAiError('');
    try {
      const res = await api.get('/admin/ai-insights');
      setAiInsights(res.data);
    } catch (err) {
      setAiInsights(null);
      setAiError(err.response?.data?.message || 'Não foi possível consultar o serviço de IA configurado.');
    } finally {
      setLoadingAi(false);
    }
  };

  if (user?.role !== 'admin' || !permissions.length) {
    return <p role="alert" className="mx-auto max-w-3xl p-8">Acesso administrativo indisponível. Entre com uma conta autorizada e perfil atribuído.</p>;
  }

  if (can('system.view')) {
    return <section className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">Administração técnica</h1>
      <p>Diagnóstico de disponibilidade dos serviços.</p>
      {systemError && <p role="alert">{systemError}</p>}
      {!systemStatus && !systemError && <p role="status">Verificando serviços…</p>}
      {systemStatus && <ul><li>API: {systemStatus.api === 'available' ? 'Disponível' : 'Indisponível'}</li><li>Banco de dados: {systemStatus.database === 'available' ? 'Disponível' : 'Indisponível'}</li></ul>}
    </section>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Top Header do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-6 rounded-3xl border border-line shadow-xs">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-3 py-1 rounded-full">
            Administração • Pruma Essential
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif text-brand-ink font-bold mt-2">
            Gestão da loja
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            Gerencie blends, categorias, pedidos e os indicadores disponíveis para sua conta.
          </p>
        </div>
        {can('products.create') && <button
          type="button"
          onClick={onOpenProductForm}
          className="flex shrink-0 items-center justify-center gap-2 bg-[#5E1A2B] hover:bg-[#4A1422] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Adicionar Blend
        </button>}
      </div>

      <nav aria-label="Áreas do painel" className="flex flex-wrap gap-2">
        {[
          ['orders.view', 'admin-pedidos', 'Gerenciar pedidos'],
          ['products.view', 'admin-blends', 'Blends e ingredientes'],
          ['categories.view', 'admin-categorias', 'Categorias'],
          ['taxonomy.view', 'admin-queixas', 'Queixas e alvos'],
          ['health.view', 'admin-metricas', 'Métricas'],
          ['insights.generate', 'admin-insights', 'Assistente de IA'],
        ].filter(([permission]) => can(permission)).map(([, id, label]) => <a key={id} href={`#${id}`} className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2">{label}</a>)}
      </nav>

      {can('taxonomy.view') && <div id="admin-queixas" className="scroll-mt-6"><AdminComplaintsManager service={api} onChanged={() => { setTaxonomyRefresh((key) => key + 1); if (can('health.view')) fetchMetrics(); }} /></div>}
      {can('categories.view') && <div id="admin-categorias" className="scroll-mt-6"><AdminCategoryManager service={api} onCategoriesChanged={onCategoriesChanged} onProductsChanged={onProductsChanged} refreshKey={catalogRefreshKey} /></div>}
      {can('products.view') && <div id="admin-blends" className="scroll-mt-6"><AdminCatalogManager onEditProduct={onEditProduct} onProductsChanged={onProductsChanged} onProductDeleted={onProductDeleted} refreshKey={`${catalogRefreshKey}-${taxonomyRefresh}`} /></div>}
      {can('orders.view') && <AdminOrderManager service={api} workflow={orderWorkflow} canUpdateFulfillment={can('orders.fulfillment.update')} />}

      {/* SECÇÃO 1: MÉTRICAS DE DEMANDAS DOS CLIENTES */}
      {can('health.view') && <section id="admin-metricas" aria-label="Métricas consentidas" className="scroll-mt-6 space-y-6">
      <button type="button" onClick={fetchMetrics} disabled={loadingMetrics} className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw className="h-4 w-4" />{loadingMetrics ? 'Atualizando métricas…' : 'Atualizar métricas'}</button>
      {metricsError && <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning-ink">{metricsError}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Distribuição das Dores */}
        <div className="bg-surface p-6 rounded-3xl border border-line shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg font-bold text-ink-strong flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand-ink" />
                Dores Principais Reportadas
              </h3>
              <span className="text-xs text-ink-faint font-semibold">
                {metrics ? metrics.total_clients_analyzed : '—'} respostas consentidas analisadas
              </span>
            </div>

            <div className="space-y-3 mt-4">
              {loadingMetrics && <p className="text-xs text-ink-soft">Carregando dados cadastrados…</p>}
              {!loadingMetrics && !metricsError && !metrics?.symptoms_distribution?.length && <p className="text-xs text-ink-soft">Ainda não há grupos com volume suficiente para exibir.</p>}
              {metrics?.symptoms_distribution?.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-ink">{item.problema}</span>
                    <span className="text-brand-ink">{item.percentage}% ({item.count} pessoas)</span>
                  </div>
                  <div className="w-full bg-surface-subtle rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#5E1A2B] h-2 rounded-full transition-all duration-500"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-line-muted text-[11px] text-ink-soft italic">
            Atualize as métricas para incluir novas respostas consentidas do questionário opcional.
          </div>
        </div>

        {/* Mapeamento de Oportunidades / Estoque */}
        <div className="bg-surface p-6 rounded-3xl border border-line shadow-xs">
          <h3 className="font-serif text-lg font-bold text-ink-strong mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-success-ink" />
            Mapeamento de Demanda vs. Catálogo
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-soft uppercase text-[10px] font-bold border-b border-line">
                <tr>
                  <th className="py-2.5 px-3">Sintoma / Queixa</th>
                  <th className="py-2.5 px-3 text-center">Interesse</th>
                  <th className="py-2.5 px-3 text-center">Blends Ativos</th>
                  <th className="py-2.5 px-3">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-muted">
                {metrics?.demand_mapping?.map((row, idx) => (
                  <tr key={idx} className="hover:bg-surface-muted/50">
                    <td className="py-2.5 px-3 font-semibold text-ink">{row.symptom}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-ink-secondary">{row.client_interest_count ?? 'Volume insuficiente'}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-ink-secondary">{row.products_available_count}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          row.status.includes('Crítico')
                            ? 'bg-danger-subtle text-danger-ink'
                            : row.status.includes('Atenção')
                            ? 'bg-warning-subtle text-warning-ink'
                            : 'bg-success-subtle text-success-ink'
                        }`}
                      >
                        {row.status.includes('Crítico') && <AlertTriangle className="w-3 h-3" />}
                        {row.status.includes('Adequado') && <CheckCircle className="w-3 h-3" />}
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <AdminAudienceReport metrics={metrics} />
      </section>}

      {/* SECÇÃO 2: MÓDULO ANDROMEDA (GEMINI AI INSIGHTS) */}
      {can('insights.generate') && <section id="admin-insights" aria-label="Assistente de estratégia" className="scroll-mt-6 bg-surface p-6 sm:p-8 rounded-3xl border border-warning-line/60 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-warning-ink bg-warning-subtle/60 px-3 py-1 rounded-full w-fit">
              <Bot className="w-4 h-4 text-warning-ink" />
              Módulo Andromeda • Inteligência Gemini
            </div>
            <h2 className="text-xl sm:text-2xl font-serif text-brand-ink font-bold mt-2">
              Assistente de Estratégia Botânica com IA
            </h2>
            <p className="text-xs text-ink-muted mt-1 max-w-2xl">
              Usa contagens agregadas de queixas, canais de aquisição e públicos do questionário consentido para gerar ideias. As respostas da IA são sugestões não verificadas e não substituem avaliação técnica ou fontes científicas.
            </p>
          </div>

          <button
            onClick={handleGenerateAiInsights}
            disabled={loadingAi}
            className="bg-[#5E1A2B] hover:bg-[#4A1422] text-white px-5 py-3 rounded-2xl text-xs font-semibold uppercase tracking-wider transition shadow-md disabled:opacity-50 flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAi ? 'animate-spin' : ''}`} />
            {loadingAi ? 'Consultando Gemini...' : 'Gerar Relatório de Estratégia'}
          </button>
        </div>

        {aiError && <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning-ink">{aiError}</p>}

        {/* Exibição dos Insights Gerados */}
        {aiInsights && (
          <div className="grid grid-cols-1 gap-6 pt-4 border-t border-warning-line/60 animate-fadeIn">
            {aiInsights.insights?.audience_summary && <section className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-serif font-bold text-brand-ink">Leitura do público pelo Andromeda</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{aiInsights.insights.audience_summary}</p>
            </section>}
            {/* Ideias de Marketing & Conteúdo */}
            <div className="bg-surface p-5 rounded-2xl border border-line shadow-xs space-y-4">
              <h4 className="font-serif font-bold text-brand-ink text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-success-ink" />
                Pautas de Conteúdo Estratégico (Redes Sociais)
              </h4>

              <div className="space-y-3">
                {!aiInsights.insights?.marketing_content_ideas?.length && <p className="text-xs text-ink-soft">Nenhuma ideia retornada nesta consulta.</p>}
                {aiInsights.insights?.marketing_content_ideas?.map((post, idx) => (
                  <div key={idx} className="p-3 bg-surface-muted rounded-xl border border-line/70 space-y-1">
                    <span className="text-[10px] bg-surface-strong text-ink-secondary font-bold px-2 py-0.5 rounded-full uppercase">
                      {post.format}
                    </span>
                    <h5 className="font-semibold text-xs text-ink-strong mt-1">
                      {post.title}
                    </h5>
                    <p className="text-[11px] text-ink-soft">
                      <span className="font-medium text-ink-secondary">Abordagem:</span> {post.hook}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </section>}

    </div>
  );
}
