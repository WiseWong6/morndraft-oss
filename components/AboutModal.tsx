import React, { useEffect, useState } from 'react';
import { Coffee, Newspaper, X } from 'lucide-react';
import type { AboutTranslations } from '../i18n';
import { resolveMornDraftStaticAssetUrl } from '../utils/staticAssetUrl';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  showSupportQr: boolean;
  t: AboutTranslations;
}

const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  showSupportQr,
  t,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && isVisible) {
      const timer = setTimeout(() => setIsVisible(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: isAnimating ? 1 : 0 }}
        onClick={onClose}
      />
      <section
        className="relative bg-slate-50 rounded-xl shadow-2xl w-full max-w-2xl mx-2 md:mx-4 max-h-[85vh] overflow-y-auto transition-all ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="morndraft-about-title"
        style={{
          opacity: isAnimating ? 1 : 0,
          transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
          transitionDuration: '250ms',
          pointerEvents: isAnimating ? 'auto' : 'none',
        }}
      >
        <header className="sticky top-0 bg-slate-50 px-6 pt-6 pb-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="morndraft-about-title" className="text-lg font-bold text-slate-900">{t.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={t.close}
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-6 py-5 space-y-6">
          <section>
            {t.problemTitle && (
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
                {t.problemTitle}
              </h3>
            )}
            <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
              {t.problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          </section>

          {showSupportQr && (
            <section className="pt-6 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
                    <Coffee size={14} className="text-indigo-600" />
                    {t.coffeeTitle}
                  </h3>
                  <div className="w-full aspect-square max-w-[132px] mx-auto rounded-xl border border-slate-200 overflow-hidden">
                    <img
                      src={resolveMornDraftStaticAssetUrl('reward.jpg')}
                      alt={t.rewardAlt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
                    <Newspaper size={14} className="text-indigo-600" />
                    {t.followTitle}
                  </h3>
                  <div className="w-full aspect-square max-w-[132px] mx-auto rounded-xl border border-slate-200 overflow-hidden">
                    <img
                      src={resolveMornDraftStaticAssetUrl('qrcode.jpg')}
                      alt={t.qrcodeAlt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-500 text-center mt-5">
                {t.support}
              </p>
            </section>
          )}
        </div>

        <footer className="sticky bottom-0 bg-slate-50 px-6 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="morndraft-about-confirm w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            {t.confirm}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default AboutModal;
