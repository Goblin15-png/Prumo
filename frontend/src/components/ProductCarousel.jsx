import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProductCarousel({ items, renderItem, label }) {
  const trackRef = useRef(null);
  const scroll = (direction) => {
    if (!trackRef.current) return;
    trackRef.current.scrollBy({
      left: direction * trackRef.current.clientWidth * 0.8,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative group/carousel">
      <div className="absolute -top-12 right-0 flex items-center gap-1 text-ink-faint">
        <button onClick={() => scroll(-1)} aria-label={`Rolar ${label} para a esquerda`} className="p-1 hover:text-ink transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => scroll(1)} aria-label={`Rolar ${label} para a direita`} className="p-1 hover:text-ink transition">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <div key={item.id} className="w-[min(72vw,220px)] sm:w-[240px] shrink-0 snap-start">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
