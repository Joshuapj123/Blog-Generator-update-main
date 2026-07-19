'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, KeyRound, ArrowLeft, ArrowRight, Loader2, CheckCircle2, Link2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GadsCreds {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
}

const EMPTY_CREDS: GadsCreds = {
  developerToken: '',
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  customerId: '',
};

interface GoogleAdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (val: boolean) => void;
  setGadsCreds: (creds: GadsCreds) => void;
}

const GADS_STEPS = [
  {
    title: 'Developer Token',
    field: 'developerToken' as const,
    placeholder: 'e.g. ABC123def456...',
    description: 'Your Google Ads Developer Token from the API Center. Go to Google Ads → Tools → API Center to find or apply for this token.',
    link: 'https://developers.google.com/google-ads/api/docs/get-started/dev-token',
    linkLabel: 'Get Developer Token →',
  },
  {
    title: 'OAuth Client ID',
    field: 'clientId' as const,
    placeholder: 'e.g. 123456789-abc.apps.googleusercontent.com',
    description: 'Create OAuth 2.0 credentials in Google Cloud Console under APIs & Services → Credentials → Create OAuth client ID. Choose "Desktop app" type.',
    link: 'https://console.cloud.google.com/apis/credentials',
    linkLabel: 'Open Cloud Console →',
  },
  {
    title: 'OAuth Client Secret',
    field: 'clientSecret' as const,
    placeholder: 'e.g. GOCSPX-xxxxxxxxxx',
    description: 'Found alongside the Client ID in Google Cloud Console. Keep this secret.',
    link: 'https://console.cloud.google.com/apis/credentials',
    linkLabel: 'Open Cloud Console →',
  },
  {
    title: 'Refresh Token',
    field: 'refreshToken' as const,
    placeholder: '1//0gxxxxxxxxxx...',
    description: 'Run the OAuth2 flow to get a refresh token. Use the Google Ads API OAuth2 playground or run the provided Python script to authorize and get the refresh token.',
    link: 'https://developers.google.com/google-ads/api/docs/oauth/oauth-desktop',
    linkLabel: 'OAuth2 Guide →',
  },
  {
    title: 'Customer ID',
    field: 'customerId' as const,
    placeholder: 'e.g. 123-456-7890 or 1234567890',
    description: 'Your Google Ads Customer ID (found in the top-right of Google Ads, format: XXX-XXX-XXXX). Remove dashes if needed.',
    link: 'https://support.google.com/google-ads/answer/1704344',
    linkLabel: 'Find Customer ID →',
  },
];

export function GoogleAdsModal({ isOpen, onClose, onConnected, setGadsCreds }: GoogleAdsModalProps) {
  const [step, setStep] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [creds, setCreds] = useState<GadsCreds>(EMPTY_CREDS);

  // Load saved creds from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gadsCreds');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCreds(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  if (!isOpen) return null;

  const handleSave = async () => {
    const allFilled = Object.values(creds).every((v) => v.trim());
    if (!allFilled) return;
    setSaveStatus('saving');
    try {
      localStorage.setItem('gadsCreds', JSON.stringify(creds));
      setGadsCreds(creds);
      onConnected(true);
      setSaveStatus('saved');
      setTimeout(() => {
        onClose();
        setSaveStatus('idle');
        setStep(0);
      }, 1200);
    } catch {
      setSaveStatus('error');
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900">Connect Google Ads Account</div>
            <div className="text-xs text-muted-foreground">Provide credentials to fetch real keyword data</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress */}
        <div className="px-6 pt-5">
          <div className="flex gap-1.5 mb-5">
            {GADS_STEPS.map((s, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-secondary'
                  }`}
              />
            ))}
          </div>

          {/* Current step */}
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {step + 1}
              </span>
              <span className="font-semibold text-sm text-foreground">{GADS_STEPS[step].title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{step + 1} / {GADS_STEPS.length}</span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {GADS_STEPS[step].description}
            </p>

            <a
              href={GADS_STEPS[step].link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
            >
              <Link2 className="w-3 h-3" />
              {GADS_STEPS[step].linkLabel}
            </a>

            <Input
              id={`gads-field-${GADS_STEPS[step].field}`}
              type={GADS_STEPS[step].field === 'clientSecret' || GADS_STEPS[step].field === 'refreshToken' ? 'password' : 'text'}
              placeholder={GADS_STEPS[step].placeholder}
              value={creds[GADS_STEPS[step].field]}
              onChange={(e) => setCreds({ ...creds, [GADS_STEPS[step].field]: e.target.value })}
              className="bg-background h-10 font-mono text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-3 bg-[var(--color-indigo-50)]">
          {step > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {step < GADS_STEPS.length - 1 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep(s => s + 1)}
                disabled={!creds[GADS_STEPS[step].field].trim()}
                className="gap-1.5"
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saveStatus === 'saving' || Object.values(creds).some(v => !v.trim())}
                className={`gap-1.5 ${saveStatus === 'saved'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-0'
                  : 'bg-primary text-primary-foreground'
                  }`}
              >
                {saveStatus === 'saving' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                ) : saveStatus === 'saved' ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Connected!</>
                ) : (
                  <><KeyRound className="w-3.5 h-3.5" /> Save &amp; Connect</>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Info footer */}
        <div className="px-6 pb-4">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-indigo-50)] border border-indigo-100 text-[11px] text-indigo-700">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Credentials are stored only in your browser&apos;s localStorage. Once connected, keyword suggestions will use the live Google Ads API instead of AI simulation.
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
