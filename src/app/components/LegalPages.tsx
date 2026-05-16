import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

const SUPPORT_EMAIL = 'support@net360preparation.com';

function LegalShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-0 net360-page net360-page-enter">
      <div className="mx-auto w-full max-w-4xl space-y-4 px-2 sm:px-4">
        <h1>{title}</h1>
        <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
        <Card>
          <CardContent className="space-y-6 pt-6 text-sm leading-6 sm:text-[0.95rem]">
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="How NET360 collects, uses, stores, and protects your information."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Information We Collect</h2>
        <p>We collect account and usage information needed to provide NET360 learning features.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account details: name, email, and profile details you provide.</li>
          <li>Authentication metadata through Firebase Authentication (including Google login when used).</li>
          <li>Learning activity such as tests, progress, preferences, and analytics events.</li>
          <li>Device and session data used for security and single-session enforcement.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. How We Use Data</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>To authenticate users and secure accounts.</li>
          <li>To deliver educational features, progress tracking, and personalized experience.</li>
          <li>To improve product quality through aggregated analytics and diagnostics.</li>
          <li>To provide support, enforce policies, and prevent abuse.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Storage and Services</h2>
        <p>
          NET360 uses Firebase Authentication for sign-in and backend services (including Mongo-backed
          data storage) for application data and account records.
        </p>
        <p>
          The app may use local storage or similar browser/app storage for session continuity,
          preferences, and UI state.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Cookies and Local Storage</h2>
        <p>
          On web, we may use browser storage and essential cookies/local storage for login/session state,
          performance, and functionality. Disabling these may affect app behavior.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. User Rights</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>You may request correction or deletion of your account data.</li>
          <li>You can request account deletion from within the app or via support email.</li>
          <li>Some records may be retained where required for security, abuse prevention, or legal compliance.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Contact</h2>
        <p>
          For privacy or data requests, contact:{' '}
          <a className="text-indigo-700 underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell
      title="Terms & Conditions"
      description="Rules for using NET360 educational services."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Educational Purpose</h2>
        <p>
          NET360 is provided for educational preparation and practice. Materials are for learning support
          and do not guarantee specific exam outcomes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Acceptable Use</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the platform lawfully and responsibly.</li>
          <li>Do not attempt unauthorized access, scraping, abuse, or disruption.</li>
          <li>Do not upload or share harmful, infringing, or misleading content.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Account Responsibilities</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>You are responsible for account credentials and all activity under your account.</li>
          <li>Provide accurate information and keep it updated.</li>
          <li>Violation of terms may result in account restrictions or suspension.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Content Ownership and License</h2>
        <p>
          NET360 platform content, branding, and materials are owned by NET360 or used with permission.
          Unauthorized reproduction or redistribution is prohibited.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Anti-Cheating and Misuse</h2>
        <p>
          Cheating, sharing answers inappropriately, manipulating tests, or exploiting the platform is not
          allowed and may lead to account action.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Limitations of Liability</h2>
        <p>
          Services are provided on an &quot;as available&quot; basis. To the extent permitted by law, NET360
          is not liable for indirect or consequential losses from platform use.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Contact</h2>
        <p>
          For terms questions, contact{' '}
          <a className="text-indigo-700 underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}

export function DeleteAccountHelpPage() {
  return (
    <LegalShell
      title="How To Delete Your NET360 Account"
      description="Users can permanently delete their NET360 Preparation account directly from the Profile/Settings section inside the app."
    >
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Process to delete account</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Open Profile / Settings.</li>
          <li>Open Danger Zone: Delete Account.</li>
          <li>Type DELETE in uppercase.</li>
          <li>Enter your registration password.</li>
          <li>Click &quot;Delete Account Permanently&quot;.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Deleted data may include</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Profile information</li>
          <li>Test history</li>
          <li>Community profile</li>
          <li>Analytics associated with the account</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data retention notice</h2>
        <p>
          Some records related to billing, security, or legal compliance may be retained temporarily for up to 90 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">For assistance contact</h2>
        <p>
          <a className="text-indigo-700 underline underline-offset-2" href="mailto:shanu1998end@gmail.com">
            shanu1998end@gmail.com
          </a>
        </p>
      </section>
    </LegalShell>
  );
}

