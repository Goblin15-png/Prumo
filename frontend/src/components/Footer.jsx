import React from 'react';
import { ShieldCheck, Leaf, Sparkles, Award } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-emerald-950 text-stone-300 mt-20">
      {/* Banner Informativo de Consciência Botânica */}
      <div className="border-b border-success-ink/60 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center md:text-left">
            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="p-3 bg-emerald-900/50 rounded-2xl text-emerald-300 mb-1">
                <Leaf className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-white font-semibold">100% Puros & Naturais</h4>
              <p className="text-xs text-ink-faint">
                Óleos essenciais destilados por arraste a vapor, livres de parabenos, fragrâncias sintéticas ou petrolatos.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="p-3 bg-emerald-900/50 rounded-2xl text-emerald-300 mb-1">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-white font-semibold">Sinergias Terapêuticas</h4>
              <p className="text-xs text-ink-faint">
                Formulações desenvolvidas com base em evidências científicas de aromaterapia e fitologia médica.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="p-3 bg-emerald-900/50 rounded-2xl text-emerald-300 mb-1">
                <Award className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-white font-semibold">Tradição & Loja Física</h4>
              <p className="text-xs text-ink-faint">
                Agora online. Experimente a consultoria personalizada ou retire seu pedido diretamente em nossa sede.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="p-3 bg-emerald-900/50 rounded-2xl text-emerald-300 mb-1">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-white font-semibold">Compra Segura</h4>
              <p className="text-xs text-ink-faint">
                Checkout criptografado com conformidade estrita aos padrões PCI-DSS. Seus dados sempre protegidos.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-ink-faint">
        <p>© 2026 Protocolo Cuidar - Farmácia Botânica & Terapias Naturais. Todos os direitos reservados.</p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white transition">Sobre Nós</a>
          <a href="#" className="hover:text-white transition">Política de Privacidade</a>
          <a href="#" className="hover:text-white transition">Contato</a>
        </div>
      </div>
    </footer>
  );
}
