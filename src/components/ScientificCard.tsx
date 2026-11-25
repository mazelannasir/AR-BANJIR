import React from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, ShieldAlert, Waves, X } from 'lucide-react';
import { SCIENTIFIC_HOTSPOTS, ScientificHotspot } from '../data/floodCurriculum';

interface ScientificCardProps {
  hotspot: ScientificHotspot | null;
  onClose: () => void;
  onSelectHotspot: (id: string) => void;
}

export const ScientificCard: React.FC<ScientificCardProps> = ({
  hotspot,
  onClose,
  onSelectHotspot,
}) => {
  if (!hotspot) return null;

  const currentIdx = SCIENTIFIC_HOTSPOTS.findIndex((h) => h.id === hotspot.id);
  const prevHotspot =
    SCIENTIFIC_HOTSPOTS[(currentIdx - 1 + SCIENTIFIC_HOTSPOTS.length) % SCIENTIFIC_HOTSPOTS.length];
  const nextHotspot =
    SCIENTIFIC_HOTSPOTS[(currentIdx + 1) % SCIENTIFIC_HOTSPOTS.length];

  const categoryColor =
    hotspot.category === 'Faktor Penyumbang'
      ? 'text-amber-300'
      : hotspot.category === 'Langkah Mitigasi'
        ? 'text-emerald-300'
        : 'text-sky-300';

  const CategoryIcon =
    hotspot.category === 'Faktor Penyumbang'
      ? ShieldAlert
      : hotspot.category === 'Langkah Mitigasi'
        ? Lightbulb
        : Waves;

  return (
    <aside
      aria-label="Maklumat Saintifik"
      className="fixed top-20 right-4 z-30 w-[min(360px,calc(100vw-2rem))] rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl p-4 text-slate-100 pointer-events-auto"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <CategoryIcon className={`w-4 h-4 shrink-0 ${categoryColor}`} />
          <span className="font-mono-tabular text-slate-400">{hotspot.number}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className={categoryColor}>{hotspot.category}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup kad penerangan"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <h3 className="font-display text-base font-semibold text-white leading-snug mb-2">
        {hotspot.title}
      </h3>

      <p className="text-xs leading-relaxed text-slate-300 mb-3">
        {hotspot.scientificExplanation}
      </p>

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 mb-2.5">
        <div className="text-[11px] font-semibold text-sky-300 mb-0.5">
          Fakta Saintifik
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">{hotspot.keyFact}</p>
      </div>

      <div className="rounded-lg bg-emerald-950/50 border border-emerald-800/60 p-2.5 mb-3">
        <div className="text-[11px] font-semibold text-emerald-300 mb-0.5">
          Langkah Pengurangan Risiko
        </div>
        <p className="text-xs text-emerald-100/90 leading-relaxed">
          {hotspot.mitigationTip}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={() => onSelectHotspot(prevHotspot.id)}
          className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Sebelum</span>
        </button>
        <span className="font-mono-tabular text-[11px] text-slate-400">
          {currentIdx + 1} / {SCIENTIFIC_HOTSPOTS.length}
        </span>
        <button
          type="button"
          onClick={() => onSelectHotspot(nextHotspot.id)}
          className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <span>Seterusnya</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
