import React, { useEffect, useState } from 'react';
import { HeartPulse, X } from 'lucide-react';

const emptyProfile = {
  sexo: 'Prefiro não dizer',
  data_nascimento: '',
  numero_telefone: '',
  problema_principal: '',
  problema_personalizado: '',
  canal_aquisicao: 'Outros',
  health_data_consent: false,
};

export default function OnboardingModal({ isOpen, onClose, onProfileUpdated, profile = null, service }) {
  const [formData, setFormData] = useState(emptyProfile);
  const [symptoms, setSymptoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    setFormData({
      sexo: profile?.sexo || emptyProfile.sexo,
      data_nascimento: profile?.data_nascimento || '',
      numero_telefone: profile?.numero_telefone || '',
      problema_principal: profile?.problema_principal || '',
      problema_personalizado: '',
      canal_aquisicao: profile?.canal_aquisicao || emptyProfile.canal_aquisicao,
      health_data_consent: false,
    });
    setError(null);

    service.get('/symptoms').then(({ data }) => {
      const names = Array.isArray(data) ? data.map((symptom) => symptom.name) : [];
      setSymptoms(names);
      setFormData((current) => ({
        ...current,
        problema_principal: current.problema_principal || '',
      }));
    }).catch(() => setError('Não foi possível carregar as opções do questionário.'));
  }, [isOpen, profile, service]);

  if (!isOpen) return null;

  const knownSymptom = symptoms.includes(formData.problema_principal);
  const customSymptom = formData.problema_principal !== '' && !knownSymptom;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      ...formData,
      problema_principal: formData.problema_principal === '__outro__'
        ? formData.problema_personalizado.trim()
        : formData.problema_principal,
    };
    delete payload.problema_personalizado;

    try {
      const response = await service.post('/user/profile', payload);
      onProfileUpdated?.(response.data.profile);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.errors?.problema_principal?.[0]
        || requestError.response?.data?.message
        || 'Falha ao salvar suas preferências. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!window.confirm('Excluir o questionário e os dados de saúde salvos nesta conta?')) return;

    setLoading(true);
    setError(null);
    try {
      await service.delete('/user/profile');
      onProfileUpdated?.(null);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Não foi possível excluir o questionário.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Questionário do cliente" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-8 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-success-ink/10 bg-canvas p-6 text-ink shadow-2xl md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold uppercase tracking-widest text-success-ink">
              <HeartPulse className="h-3.5 w-3.5" /> Questionário opcional
            </span>
            <h2 className="mt-3 font-serif text-2xl text-success-ink">Personalize suas recomendações</h2>
            <p className="mt-1 text-sm text-ink-muted">Você pode preencher agora ou continuar sem informar esses dados.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar questionário" className="rounded-full p-1 text-ink-faint hover:bg-surface-strong hover:text-ink-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-lg border border-success-ink/15 bg-success-soft/60 p-3 text-xs leading-relaxed text-ink-secondary">
            O questionário é opcional. Escolha a principal queixa que você sente. As opções são cadastradas pela loja. As respostas são usadas para personalizar recomendações e gerar estatísticas agregadas de procura.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Queixa ou necessidade principal *</label>
            <select
              aria-label="Queixa principal"
              value={knownSymptom ? formData.problema_principal : customSymptom ? '__outro__' : ''}
              onChange={(event) => setFormData((current) => ({
                ...current,
                problema_principal: event.target.value,
                problema_personalizado: event.target.value === '__outro__' ? current.problema_personalizado : '',
              }))}
              required
              className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink"
            >
              <option value="" disabled>Selecione sua queixa principal</option>
              {symptoms.map((symptom) => <option key={symptom} value={symptom}>{symptom}</option>)}
              <option value="__outro__">Outro</option>
            </select>
            {customSymptom && (
              <input
                type="text"
                value={formData.problema_personalizado || (formData.problema_principal !== '__outro__' ? formData.problema_principal : '')}
                onChange={(event) => setFormData((current) => ({ ...current, problema_principal: '__outro__', problema_personalizado: event.target.value }))}
                required
                maxLength={150}
                placeholder="Escreva uma opção"
                className="mt-2 w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Sexo / gênero</label>
              <select name="sexo" value={formData.sexo} onChange={(event) => setFormData((current) => ({ ...current, sexo: event.target.value }))} className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink">
                <option value="Prefiro não dizer">Prefiro não dizer</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Data de nascimento</label>
              <input type="date" name="data_nascimento" value={formData.data_nascimento || ''} onChange={(event) => setFormData((current) => ({ ...current, data_nascimento: event.target.value }))} className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Telefone / WhatsApp (opcional)</label>
            <input type="tel" name="numero_telefone" autoComplete="tel" value={formData.numero_telefone || ''} onChange={(event) => setFormData((current) => ({ ...current, numero_telefone: event.target.value }))} maxLength={30} className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Como nos conheceu?</label>
            <select name="canal_aquisicao" value={formData.canal_aquisicao} onChange={(event) => setFormData((current) => ({ ...current, canal_aquisicao: event.target.value }))} className="w-full rounded-lg border border-line-strong bg-surface p-2.5 text-sm outline-none focus:ring-2 focus:ring-success-ink">
              <option value="Instagram">Instagram</option>
              <option value="Indicação de Amigos">Indicação de Amigos</option>
              <option value="Loja Física">Loja Física</option>
              <option value="Pesquisa no Google">Pesquisa no Google</option>
              <option value="TikTok">TikTok</option>
              <option value="Kwai">Kwai</option>
              <option value="Outros">Outros</option>
            </select>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-secondary">
            <input
              type="checkbox"
              checked={formData.health_data_consent}
              onChange={(event) => setFormData((current) => ({ ...current, health_data_consent: event.target.checked }))}
              required
              className="mt-0.5 accent-[#5E1A2B]"
            />
            <span>Concordo com o uso das respostas deste questionário para os fins descritos acima. Sei que posso excluí-las depois pela minha conta.</span>
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted transition hover:text-ink-strong">Pular por enquanto</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-emerald-800 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-900 disabled:opacity-50">
              {loading ? 'Salvando…' : 'Salvar preferências'}
            </button>
          </div>
          {profile && (
            <button type="button" onClick={handleDeleteProfile} disabled={loading} className="w-full text-center text-xs font-semibold text-danger-ink underline disabled:opacity-50">
              Excluir questionário e dados do perfil
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
