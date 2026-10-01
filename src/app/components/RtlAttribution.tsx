import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const RTL_LOGO = '/rtl-logo.jpg';
const RTL_EMAIL = 'shahnawaz@sustainablesoluiton360.com';

const FACTS = [
  { label: 'CEO', value: 'Shahnawaz' },
  { label: 'Email', value: RTL_EMAIL },
  { label: 'Corporate status', value: 'SECP Registered Company' },
  { label: 'Corporate ID', value: '0343147' },
  { label: 'Incorporation', value: 'Incorporated under the Companies Act, 2017' },
] as const;

export function RtlAttribution() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="net360-rtl-bar" onClick={() => setOpen(true)}>
        <img src={RTL_LOGO} alt="" />
        <span>Powered by RTL</span>
      </button>
      {open ? createPortal(
        <div className="net360-rtl-sheet-root" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="net360-rtl-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="net360-rtl-title"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={RTL_LOGO} alt="Resilience Technologies Labs" className="net360-rtl-sheet-logo" />
            <h2 id="net360-rtl-title">Resilience Technologies Labs</h2>
            <p className="net360-rtl-sheet-role">Developer & Technology Partner for NET360</p>
            <dl>
              {FACTS.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.label === 'Email' ? <a href={`mailto:${RTL_EMAIL}`}>{fact.value}</a> : fact.value}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="net360-rtl-sheet-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
