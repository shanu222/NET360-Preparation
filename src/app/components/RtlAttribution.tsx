import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="net360-rtl-chip">
          <img src={RTL_LOGO} alt="" className="net360-rtl-mark" />
          <span>Powered by RTL</span>
        </button>
      </DialogTrigger>
      <DialogContent className="net360-rtl-dialog gap-0 overflow-hidden p-0 sm:max-w-[24rem]">
        <div className="net360-rtl-card">
          <img src={RTL_LOGO} alt="Resilience Technologies Labs" className="net360-rtl-card-logo" />
          <DialogTitle className="net360-rtl-card-name">Resilience Technologies Labs</DialogTitle>
          <DialogDescription className="net360-rtl-card-role">
            Developer & Technology Partner for NET360
          </DialogDescription>
          <dl className="net360-rtl-facts">
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.label === 'Email' ? <a href={`mailto:${RTL_EMAIL}`}>{fact.value}</a> : fact.value}</dd>
              </div>
            ))}
          </dl>
          <div className="net360-rtl-card-actions">
            <DialogClose asChild>
              <button type="button" className="net360-rtl-close">Close</button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
