import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaymentBlock } from '../lib/paymentBlocks';
import PaymentBlockCard from './PaymentBlockCard';

// Autoavance recomendado: 8s (las tarjetas tienen formulario, da tiempo a leer).
const AUTOPLAY_MS = 8000;

// Carrusel de bloques de aporte: una columna a la vez (imagen + tarjeta),
// con autoavance, flechas prev/next, puntos y pausa al pasar el cursor.
const PaymentBlocksCarousel: React.FC<{ blocks: PaymentBlock[] }> = ({ blocks }) => {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const count = blocks.length;

    useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

    useEffect(() => {
        if (paused || count <= 1) return;
        const t = setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS);
        return () => clearInterval(t);
    }, [paused, count]);

    if (count === 0) return null;

    const go = (dir: number) => setIndex(i => (i + dir + count) % count);

    return (
        <div
            className="relative max-w-5xl mx-auto"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className="overflow-hidden">
                <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
                    {blocks.map(block => (
                        <div key={block.id} className="w-full flex-shrink-0 px-1">
                            <div className={`grid gap-8 items-stretch ${block.image ? 'md:grid-cols-2' : 'max-w-md mx-auto'}`}>
                                {block.image && (
                                    <div className="rounded-3xl overflow-hidden shadow-xl">
                                        <img
                                            src={block.image}
                                            alt={block.title}
                                            className="w-full h-full object-cover min-h-[280px]"
                                        />
                                    </div>
                                )}
                                <div className="h-full">
                                    <PaymentBlockCard block={block} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {count > 1 && (
                <>
                    <button
                        onClick={() => go(-1)}
                        aria-label="Anterior"
                        className="absolute top-1/2 -translate-y-1/2 -left-2 md:-left-5 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-600 hover:text-rotary-blue hover:scale-105 transition z-10"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => go(1)}
                        aria-label="Siguiente"
                        className="absolute top-1/2 -translate-y-1/2 -right-2 md:-right-5 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center text-gray-600 hover:text-rotary-blue hover:scale-105 transition z-10"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>

                    <div className="flex items-center justify-center gap-2 mt-8">
                        {blocks.map((b, i) => (
                            <button
                                key={b.id}
                                onClick={() => setIndex(i)}
                                aria-label={`Ir al aporte ${i + 1}`}
                                className={`h-2.5 rounded-full transition-all ${i === index ? 'w-7 bg-rotary-blue' : 'w-2.5 bg-gray-300 hover:bg-gray-400'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default PaymentBlocksCarousel;
