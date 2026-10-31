import React from 'react';

const dimensions = { acquisition: 'Canal de aquisição', gender: 'Sexo / gênero informado', age: 'Faixa etária' };
export default function AdminAudienceReport({ metrics }) {
  const audience = metrics?.audience || {};
  return <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
    <h2 className="font-serif text-xl font-bold text-brand-ink">Público, origem e queixas</h2>
    <p className="text-xs text-ink-muted">Respostas consentidas do questionário. Contagens representam relatos, sem diagnóstico. Grupos com menos de {metrics?.minimum_group_size || 5} pessoas não são exibidos; percentuais usam a base consentida e podem não somar 100%.</p>
    <div className="grid gap-4 lg:grid-cols-3">{Object.entries(dimensions).map(([key, label]) => <div key={key} className="rounded-xl border border-line p-4">
      <h3 className="mb-3 text-sm font-semibold">{label}</h3>
      {!audience[key]?.length && <p className="text-xs text-ink-soft">Sem volume suficiente para exibir.</p>}
      <ul className="space-y-3">{audience[key]?.map((group) => <li key={group.label} className="space-y-1 text-xs">
        <div className="flex justify-between gap-2"><span>{group.label}</span><strong>{group.count} pessoas · {group.percentage}%</strong></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full bg-[#5E1A2B]" style={{ width: `${group.percentage}%` }} /></div>
      </li>)}</ul>
    </div>)}</div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs"><caption className="mb-2 text-left font-semibold">Queixas por público e canal — maiores contagens primeiro</caption>
        <thead><tr className="border-b"><th className="p-2">Recorte</th><th className="p-2">Público / canal</th><th className="p-2">Queixa relatada</th><th className="p-2">Pessoas</th></tr></thead>
        <tbody>{metrics?.complaint_by_audience?.map((row) => <tr key={`${row.dimension}-${row.label}-${row.complaint}`} className="border-b border-line-muted"><td className="p-2">{dimensions[row.dimension]}</td><td className="p-2">{row.label}</td><td className="p-2">{row.complaint}</td><td className="p-2 font-semibold">{row.count}</td></tr>)}</tbody>
      </table>
      {!metrics?.complaint_by_audience?.length && <p className="p-2 text-xs text-ink-soft">Ainda não há grupos suficientes para cruzar público e queixas.</p>}
    </div>
  </section>;
}
