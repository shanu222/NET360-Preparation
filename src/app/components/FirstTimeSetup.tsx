import { type ReactNode, useMemo, useState } from 'react';
import { CheckCircle2, FileCheck, Globe, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import {
  requestCameraAccessPermission,
  requestFileAccessPermission,
  requestNotificationAccessPermission,
  type PermissionResolution,
} from '../lib/nativeMobile';

type PermissionKey = 'camera' | 'files' | 'internet' | 'notifications';

type PermissionState = {
  status: 'pending' | 'granted' | 'denied';
  detail: string;
};

const STATUS_STYLES: Record<PermissionState['status'], string> = {
  pending: 'bg-slate-100 text-slate-600',
  granted: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-amber-100 text-amber-700',
};

const TERMS_VERSION = 'v1';
export const TERMS_ACCEPTED_KEY = `net360-terms-accepted-${TERMS_VERSION}`;
export const TERMS_ACCEPTED_AT_KEY = `net360-terms-accepted-at-${TERMS_VERSION}`;

export function isTermsAccepted() {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true';
}

interface FirstTimeSetupProps {
  onComplete: () => void;
}

export function FirstTimeSetup({ onComplete }: FirstTimeSetupProps) {
  const [step, setStep] = useState<'terms' | 'permissions'>('terms');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyPermission, setBusyPermission] = useState<PermissionKey | null>(null);
  const [permissionState, setPermissionState] = useState<Record<PermissionKey, PermissionState>>({
    camera: {
      status: 'pending',
      detail: 'Needed for uploading question photos and image-based doubt analysis.',
    },
    files: {
      status: 'pending',
      detail: 'Needed for uploading PDF notes, screenshots, and documents.',
    },
    internet: {
      status: 'pending',
      detail: 'Required for tests, community sync, analytics, and real-time content updates.',
    },
    notifications: {
      status: 'pending',
      detail: 'Used for test reminders, announcements, and account or moderation alerts.',
    },
  });

  const allPermissionsAcknowledged = useMemo(
    () => Object.values(permissionState).every((item) => item.status !== 'pending'),
    [permissionState],
  );

  const updatePermission = (key: PermissionKey, next: PermissionState) => {
    setPermissionState((previous) => ({
      ...previous,
      [key]: next,
    }));
  };

  const applyResolution = (key: PermissionKey, result: PermissionResolution) => {
    updatePermission(key, {
      status: result.granted ? 'granted' : 'denied',
      detail: result.message,
    });
  };

  const requestCamera = async () => {
    setBusyPermission('camera');
    const result = await requestCameraAccessPermission();
    applyResolution('camera', result);
    setBusyPermission(null);
  };

  const requestFiles = async () => {
    setBusyPermission('files');
    const result = await requestFileAccessPermission();
    applyResolution('files', result);
    setBusyPermission(null);
  };

  const requestNotifications = async () => {
    setBusyPermission('notifications');
    const result = await requestNotificationAccessPermission();
    applyResolution('notifications', result);
    setBusyPermission(null);
  };

  const markInternetAcknowledged = () => {
    updatePermission('internet', {
      status: 'granted',
      detail: 'Internet requirement acknowledged. The app cannot function without network access.',
    });
  };

  const finishSetup = async () => {
    setIsSaving(true);
    localStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
    localStorage.setItem(TERMS_ACCEPTED_AT_KEY, new Date().toISOString());
    onComplete();
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ecf0ff] via-[#f6f8ff] to-[#fff2e7] p-3 sm:p-5">
      <div className="mx-auto max-w-4xl">
        <Card className="border-indigo-100 bg-white/96 shadow-[0_16px_38px_rgba(98,113,202,0.14)]">
          <CardHeader className="space-y-2 border-b border-indigo-100/80">
            <CardTitle className="text-2xl text-indigo-950">Welcome to NET360</CardTitle>
            <CardDescription className="text-slate-600">
              First-time setup requires reviewing Terms and Conditions and confirming required permissions.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 p-4 sm:p-6">
            {step === 'terms' ? (
              <>
                <section className="space-y-4 rounded-xl border border-indigo-100 bg-[#f9faff] p-4">
                  <h2 className="text-xl text-indigo-900">Terms and Conditions</h2>
                  <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1 text-sm text-slate-700">
                    <div>
                      <h3 className="text-base text-indigo-900">1. Platform Scope and Purpose</h3>
                      <p>
                        NET360 is a preparation and guidance platform for NET aspirants. It includes practice tests, analytics,
                        question contributions, preparation materials, AI-assisted guidance, and community collaboration tools.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">2. Account and User Responsibilities</h3>
                      <p>
                        You are responsible for the accuracy of your account details, activity performed from your account,
                        and keeping your credentials private. You must not impersonate others or bypass account/session controls.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">3. Acceptable Community Behavior</h3>
                      <p>
                        Respectful communication is mandatory. Harassment, hate speech, threats, explicit content, fraud,
                        spam, or harmful behavior is prohibited in chat, discussion rooms, posts, and messages.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">4. Content Submission Rules</h3>
                      <p>
                        Submitted questions, attachments, and notes must be relevant, lawful, and non-infringing. You must
                        not upload malicious, misleading, or copyrighted content without rights. Moderation may reject or remove
                        violating submissions.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">5. Privacy and Data Usage</h3>
                      <p>
                        The platform stores profile data, progress metrics, test attempts, and interaction logs to provide
                        analytics, recommendations, moderation, and account security. Data is used to improve learning outcomes
                        and maintain platform integrity.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">6. AI and Analysis Features</h3>
                      <p>
                        AI-generated outputs are advisory and may not always be perfect. Users should validate important
                        academic decisions independently. Misuse of AI features for abuse, cheating workflows, or harmful
                        purposes is prohibited.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">7. Moderation and Enforcement</h3>
                      <p>
                        NET360 may warn, mute, block, suspend, or permanently ban accounts for policy violations, harmful
                        behavior, repeated abuse, or attempts to compromise platform security.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base text-indigo-900">8. Service Reliability and Updates</h3>
                      <p>
                        Features may evolve over time. We may update content, eligibility logic, and terms to maintain quality,
                        safety, and compliance. Continued use after updates indicates acceptance of revised terms.
                      </p>
                    </div>
                  </div>
                </section>

                <label className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-white p-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                  />
                  <span>I have read and agree to the Terms and Conditions.</span>
                </label>

                <div className="flex justify-end">
                  <Button type="button" disabled={!acceptedTerms} onClick={() => setStep('permissions')}>
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <section className="space-y-3 rounded-xl border border-indigo-100 bg-[#f9faff] p-4">
                  <h2 className="text-xl text-indigo-900">Permissions Setup</h2>
                  <p className="text-sm text-slate-600">
                    Granting these permissions enables full functionality and a better app experience.
                  </p>

                  <PermissionRow
                    title="Camera Access"
                    explanation="This permission allows you to upload images of questions for analysis."
                    state={permissionState.camera}
                    icon={<FileCheck className="h-4 w-4" />}
                    actionLabel={busyPermission === 'camera' ? 'Requesting...' : 'Allow Camera'}
                    onAction={requestCamera}
                    disabled={busyPermission !== null}
                  />

                  <PermissionRow
                    title="Storage/File Access"
                    explanation="This permission allows you to upload images, PDFs, and supporting documents."
                    state={permissionState.files}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    actionLabel={busyPermission === 'files' ? 'Requesting...' : 'Allow Files'}
                    onAction={requestFiles}
                    disabled={busyPermission !== null}
                  />

                  <PermissionRow
                    title="Internet Access"
                    explanation="Internet is required to sync tests, analytics, community updates, and admin-managed content."
                    state={permissionState.internet}
                    icon={<Globe className="h-4 w-4" />}
                    actionLabel="Understood"
                    onAction={markInternetAcknowledged}
                    disabled={busyPermission !== null || permissionState.internet.status === 'granted'}
                  />

                  <PermissionRow
                    title="Notification Permission"
                    explanation="This permission allows reminders, announcements, and important platform updates."
                    state={permissionState.notifications}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    actionLabel={busyPermission === 'notifications' ? 'Requesting...' : 'Allow Notifications'}
                    onAction={requestNotifications}
                    disabled={busyPermission !== null}
                  />
                </section>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep('terms')}>
                    Back to Terms
                  </Button>
                  <Button type="button" disabled={!allPermissionsAcknowledged || isSaving} onClick={finishSetup}>
                    {isSaving ? 'Finalizing...' : 'Finish Setup'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PermissionRow({
  title,
  explanation,
  state,
  icon,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  explanation: string;
  state: PermissionState;
  icon: ReactNode;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm text-indigo-900">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[state.status]}`}>{state.status}</span>
      </div>
      <p className="mb-2 text-sm text-slate-600">{explanation}</p>
      <p className="mb-3 text-xs text-slate-500">{state.detail}</p>
      <Button type="button" variant="outline" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
