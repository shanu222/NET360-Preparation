import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from './ui/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PasswordInput } from './ui/password-input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Award, Bot, ChevronDown, ChevronUp, FlaskConical, GraduationCap, Loader2, LogOut, MessageCircle, RefreshCw, Settings, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { NET360_ADMIN_WHATSAPP, NET360_ADMIN_WHATSAPP_LINK } from '../lib/paymentMethods';
import { NET_TARGET_PROGRAM_OPTIONS } from '../lib/netPrograms';
import { loginBannerImageUrl, appPromoImageUrl, getMediaUrl } from '../lib/publicMedia';
import { Net360UserGuideVideoSection } from './Net360UserGuideVideo';
const PROFILE_PHOTO_STORAGE_KEY = 'net360-profile-photo-data-url';

function GoogleLogo(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={props.className}>
      <path fill="#EA4335" d="M12 10.2v3.96h5.5c-.24 1.28-.96 2.36-2.04 3.08l3.3 2.56c1.92-1.76 3.02-4.36 3.02-7.46 0-.72-.06-1.42-.2-2.1H12z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.88 6.62-2.38l-3.3-2.56c-.92.62-2.1.98-3.32.98-2.56 0-4.74-1.72-5.52-4.02l-3.4 2.62A10 10 0 0 0 12 22z" />
      <path fill="#4A90E2" d="M6.48 14.02A5.94 5.94 0 0 1 6.16 12c0-.7.12-1.38.32-2.02l-3.4-2.62A10 10 0 0 0 2 12c0 1.62.38 3.14 1.06 4.46l3.42-2.44z" />
      <path fill="#FBBC05" d="M12 5.96c1.46 0 2.76.5 3.78 1.48l2.84-2.84C16.94 3.04 14.68 2 12 2A10 10 0 0 0 3.08 7.36l3.4 2.62C7.26 7.68 9.44 5.96 12 5.96z" />
    </svg>
  );
}

function AppleLogo(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={props.className}>
      <path
        fill="currentColor"
        d="M16.37 12.56c.02 2.22 1.95 2.96 1.97 2.97-.02.05-.3 1.05-.98 2.08-.59.89-1.2 1.78-2.16 1.8-.94.02-1.25-.56-2.33-.56-1.08 0-1.43.54-2.3.58-.93.03-1.63-.94-2.22-1.83-1.2-1.73-2.12-4.9-.88-7.05.61-1.06 1.7-1.74 2.89-1.75.9-.02 1.75.61 2.33.61.58 0 1.66-.76 2.8-.65.48.02 1.82.19 2.67 1.43-.07.04-1.6.94-1.58 2.37zM14.66 6.67c.49-.59.82-1.41.73-2.22-.7.03-1.55.47-2.05 1.06-.45.52-.84 1.36-.74 2.16.78.06 1.57-.39 2.06-1z"
      />
    </svg>
  );
}

const LEGACY_TARGET_PROGRAM_LABELS: Record<string, string> = {
  cs: 'Computer Science',
  ee: 'Electrical Engineering',
  me: 'Mechanical Engineering',
  'artificial-intelligence': 'Artificial Intelligence',
  se: 'Software Engineering',
};

interface ProfileProps {
  onNavigate?: (section: string) => void;
}

type AuthPanelMode = 'login' | 'register' | 'recovery';
type AuthActionState = 'idle' | 'loggingIn' | 'creatingAccount';

export function Profile({ onNavigate }: ProfileProps) {
  const { user, login, loginWithGoogle, loginWithApple, registerWithToken, sendRecoveryEmail, logout } = useAuth();
  const { profile, preferences, attempts, saveProfile, savePreferences } = useAppData();
  const [localProfile, setLocalProfile] = useState(profile);
  const [avatarPreview, setAvatarPreview] = useState(() => {
    try {
      return localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [authMode, setAuthMode] = useState<AuthPanelMode>('login');
  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotCooldownSeconds, setForgotCooldownSeconds] = useState(0);
  const [registerConflictBanner, setRegisterConflictBanner] = useState('');
  const [authActionState, setAuthActionState] = useState<AuthActionState>('idle');
  const [showDeleteAccountPanel, setShowDeleteAccountPanel] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountConfirmationText, setDeleteAccountConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isPersonalInfoExpanded, setIsPersonalInfoExpanded] = useState(true);
  const [isPreparationExpanded, setIsPreparationExpanded] = useState(true);
  const [isSavingTargetProgram, setIsSavingTargetProgram] = useState(false);

  const targetProgramOptions = useMemo(() => NET_TARGET_PROGRAM_OPTIONS, []);
  const selectedTargetProgramLabel =
    targetProgramOptions.find((option) => option.value === localProfile.targetProgram)?.label ||
    LEGACY_TARGET_PROGRAM_LABELS[String(localProfile.targetProgram || '').toLowerCase()] ||
    localProfile.targetProgram;

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    setLocalProfile((previous) => ({
      ...previous,
      firstName: previous.firstName || user.firstName || '',
      lastName: previous.lastName || user.lastName || '',
      email: previous.email || user.email || '',
    }));
  }, [user]);

  useEffect(() => {
    // Always reset delete-account inputs when opening profile for a user session.
    setShowDeleteAccountPanel(false);
    setDeleteAccountConfirmationText('');
    setDeleteAccountPassword('');
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    if (forgotCooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setForgotCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCooldownSeconds]);


  const avatarText = useMemo(() => {
    const first = localProfile.firstName?.trim()[0] ?? 'S';
    const last = localProfile.lastName?.trim()[0] ?? 'T';
    return `${first}${last}`.toUpperCase();
  }, [localProfile.firstName, localProfile.lastName]);

  const updateField = (key: keyof typeof localProfile, value: string) => {
    setLocalProfile((previous) => ({ ...previous, [key]: value }));
  };

  const isRegisterMode = authMode === 'register';
  const isRecoveryMode = authMode === 'recovery';
  const isAuthBusy = authActionState !== 'idle';

  const resetAuthActionState = () => {
    setAuthActionState('idle');
  };

  const handleAuthSubmit = async () => {
    if (isAuthBusy) return;

    try {
      if (isRegisterMode) {
        setRegisterConflictBanner('');
      }

      if (!authForm.email) {
        toast.error('Email is required.');
        return;
      }

      if (isRegisterMode) {
        if (!authForm.password) {
          toast.error('Password is required.');
          return;
        }

        setAuthActionState('creatingAccount');
        await registerWithToken({
          email: authForm.email,
          password: authForm.password,
          firstName: authForm.firstName,
          lastName: authForm.lastName,
        });
        setAuthActionState('idle');
        toast.success('Account created successfully.');
      } else {
        setAuthActionState('loggingIn');

        if (!authForm.password) {
          setAuthActionState('idle');
          toast.error('Password is required.');
          return;
        }

        try {
          await login(authForm.email, authForm.password);
        } catch (error) {
          const conflict = error as Error & { code?: string };
          if (conflict?.code === 'active_session_exists') {
            const shouldSwitch = window.confirm(
              'This account is active on another device. Do you want to log out the previous device and continue here?',
            );
            if (!shouldSwitch) {
              setAuthActionState('idle');
              return;
            }
            await login(authForm.email, authForm.password, { forceLogoutOtherDevice: true });
          } else {
            throw error;
          }
        }
        setAuthActionState('idle');
        toast.success('Logged in successfully.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      const typed = error as Error & { status?: number };
      setAuthActionState('idle');
      if (isRegisterMode && typed.status === 409) {
        setRegisterConflictBanner(message);
      }
      toast.error(message);
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (forgotCooldownSeconds > 0) {
      toast.error(`Please wait ${forgotCooldownSeconds}s before sending another reset email.`);
      return;
    }

    const identifier = forgotIdentifier.trim() || authForm.email.trim();

    if (!identifier) {
      toast.error('Enter your registered email.');
      return;
    }

    try {
      await sendRecoveryEmail(identifier);
      toast.success('Password reset email sent. Check your inbox.');
      setForgotCooldownSeconds(30);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send password reset email.');
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'apple') => {
    if (isAuthBusy) return;
    try {
      setAuthActionState('loggingIn');
      if (provider === 'google') {
        await loginWithGoogle();
      } else {
        await loginWithApple();
      }
      setAuthActionState('idle');
      toast.success(`Signed in with ${provider === 'google' ? 'Google' : 'Apple'} successfully.`);
    } catch (error) {
      setAuthActionState('idle');
      toast.error(error instanceof Error ? error.message : 'Social login failed.');
    }
  };

  const savePersonalInfo = async () => {
    try {
      await saveProfile({
        firstName: localProfile.firstName,
        lastName: localProfile.lastName,
        phone: localProfile.phone,
        city: localProfile.city,
      });
      toast.success('Personal information saved to server.');
      setIsPersonalInfoExpanded(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save profile.');
    }
  };

  const savePreparationDetails = async () => {
    try {
      await saveProfile({
        targetProgram: localProfile.targetProgram,
        testSeries: localProfile.testSeries,
        sscPercentage: localProfile.sscPercentage,
        hsscPercentage: localProfile.hsscPercentage,
        testDate: localProfile.testDate,
      });
      toast.success('Preparation details updated on server.');
      setIsPreparationExpanded(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update details.');
    }
  };

  const handleTargetProgramSelect = async (targetProgram: string) => {
    if (!targetProgram || isSavingTargetProgram) return;

    const previousProgram = String(localProfile.targetProgram || '');
    if (previousProgram === targetProgram) {
      return;
    }

    setLocalProfile((previous) => ({ ...previous, targetProgram }));
    setIsSavingTargetProgram(true);

    try {
      await saveProfile({ targetProgram });
      toast.success('Target program updated. Dashboard refreshed.');
    } catch (error) {
      setLocalProfile((previous) => ({ ...previous, targetProgram: previousProgram }));
      toast.error(error instanceof Error ? error.message : 'Could not update target program.');
    } finally {
      setIsSavingTargetProgram(false);
    }
  };

  const togglePreference = async (key: keyof typeof preferences) => {
    const nextValue = !preferences[key];
    try {
      await savePreferences({ [key]: nextValue });
      toast.message(`${key} ${nextValue ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save preference.');
    }
  };

  const triggerPhotoPicker = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const nextUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!nextUrl) {
        toast.error('Could not read selected photo.');
        return;
      }

      setAvatarPreview((previous) => {
        if (previous && previous.startsWith('blob:')) {
          URL.revokeObjectURL(previous);
        }
        return nextUrl;
      });

      try {
        localStorage.setItem(PROFILE_PHOTO_STORAGE_KEY, nextUrl);
      } catch {
        // Non-blocking when storage is not available.
      }

      toast.success('Profile photo updated locally for this browser session.');
    };

    reader.onerror = () => {
      toast.error('Could not read selected photo.');
    };

    reader.readAsDataURL(file);
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountPassword.trim()) {
      toast.error('Enter your registration password to confirm account deletion.');
      return;
    }

    if (deleteAccountConfirmationText.trim() !== 'DELETE') {
      toast.error('Type DELETE exactly to confirm permanent account deletion.');
      return;
    }

    const approved = window.confirm(
      'Deleting your account is permanent and will remove your access to the platform. If you want to use NET360 again later, you will need to create a new account and obtain access again. Continue?',
    );
    if (!approved) return;

    try {
      setIsDeletingAccount(true);
      const payload = await apiRequest<{ message: string }>('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({
          password: deleteAccountPassword,
          confirmationText: deleteAccountConfirmationText.trim(),
        }),
      });

      toast.success(payload.message || 'Account deleted successfully.');
      setDeleteAccountPassword('');
      setDeleteAccountConfirmationText('');
      logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete account.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const toggleDeleteAccountPanel = () => {
    setShowDeleteAccountPanel((previous) => {
      const next = !previous;
      // Ensure fields are never prefilled when panel opens.
      if (next) {
        setDeleteAccountConfirmationText('');
        setDeleteAccountPassword('');
      }
      return next;
    });
  };

  if (!user) {
    return (
      <div className="space-y-5">
        <h1>Account Access</h1>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[1fr_1.65fr]">
          <Card className="rounded-2xl border-indigo-100 bg-white/92 shadow-[0_14px_32px_rgba(98,113,202,0.12)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-800">
                {isRecoveryMode ? 'Recover Password' : isRegisterMode ? 'Create Account' : 'Login'}
              </CardTitle>
              <CardDescription className="text-slate-600">
                {isRecoveryMode
                  ? 'Enter your registered email to receive a Firebase password reset email.'
                  : isRegisterMode
                  ? 'Create your account directly with Firebase authentication.'
                  : 'Users can only stay logged in on one device at a time.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRecoveryMode ? (
                <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="forgot-identifier">Registered Email</Label>
                    <Input
                      id="forgot-identifier"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="student@example.com"
                      className="h-10 border-indigo-100"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full border-indigo-200 bg-white !text-indigo-700 hover:bg-indigo-50 hover:!text-indigo-800"
                    disabled={forgotCooldownSeconds > 0}
                    onClick={() => void handleForgotPasswordRequest()}
                  >
                    {forgotCooldownSeconds > 0 ? `Retry in ${forgotCooldownSeconds}s` : 'Send Password Reset Email'}
                  </Button>
                </div>
              ) : (
                <>
              {isRegisterMode ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-first-name">First Name</Label>
                    <Input
                      id="reg-first-name"
                      value={authForm.firstName}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="h-11 border-indigo-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-last-name">Last Name</Label>
                    <Input
                      id="reg-last-name"
                      value={authForm.lastName}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="h-11 border-indigo-100"
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={authForm.email}
                    onChange={(e) => {
                      setRegisterConflictBanner('');
                      setAuthForm((prev) => ({ ...prev, email: e.target.value }));
                    }}
                  placeholder="student@example.com"
                  className="h-11 border-indigo-100"
                />
              </div>

                {isRegisterMode && registerConflictBanner ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert" aria-live="polite">
                    {registerConflictBanner}
                  </div>
                ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <PasswordInput
                  id="auth-password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter your password"
                  className="h-11 border-indigo-100"
                />
              </div>

              {isRegisterMode ? (
                <p className="text-xs text-slate-500">Create account with first name, last name, email, and password only.</p>
              ) : null}

              <Button
                className="relative h-11 w-full rounded-xl bg-gradient-to-r from-indigo-700 to-violet-600 !text-white font-semibold shadow-sm hover:from-indigo-800 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-90"
                onClick={handleAuthSubmit}
                disabled={isAuthBusy}
              >
                {isAuthBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {authActionState === 'loggingIn'
                  ? 'Logging in...'
                  : authActionState === 'creatingAccount'
                  ? 'Creating account...'
                  : isRegisterMode
                  ? 'Create Account'
                  : 'Sign In'}
              </Button>

              {isAuthBusy ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-100" aria-hidden="true">
                  <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
                </div>
              ) : null}

              {(authActionState === 'loggingIn' || authActionState === 'creatingAccount') && !isRecoveryMode ? (
                <div
                  className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-white to-indigo-50 p-3 shadow-[0_10px_26px_rgba(79,70,229,0.14)]"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <p className="text-sm leading-relaxed text-slate-700">
                      {authActionState === 'loggingIn'
                        ? 'Logging in... please wait.'
                        : 'Creating account... please wait.'}
                    </p>
                  </div>
                </div>
              ) : null}
                </>
              )}

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className={`min-h-[2.75rem] h-auto rounded-lg px-2 py-2 text-center text-[12px] leading-tight whitespace-normal sm:text-sm ${
                      authMode === 'login'
                        ? 'bg-gradient-to-r from-indigo-700 to-violet-600 !text-white shadow-sm hover:from-indigo-800 hover:to-violet-700'
                        : 'bg-white !text-slate-700 hover:bg-indigo-50 hover:!text-indigo-700'
                    }`}
                    onClick={() => {
                      setRegisterConflictBanner('');
                      resetAuthActionState();
                      setAuthMode('login');
                    }}
                  >
                    Login
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`min-h-[2.75rem] h-auto rounded-lg px-2 py-2 text-center text-[12px] leading-tight whitespace-normal sm:text-sm ${
                      authMode === 'register'
                        ? 'bg-gradient-to-r from-indigo-700 to-violet-600 !text-white shadow-sm hover:from-indigo-800 hover:to-violet-700'
                        : 'bg-white !text-slate-700 hover:bg-indigo-50 hover:!text-indigo-700'
                    }`}
                    onClick={() => {
                      setRegisterConflictBanner('');
                      resetAuthActionState();
                      setAuthMode('register');
                    }}
                  >
                    Create Account
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`min-h-[2.75rem] h-auto rounded-lg px-2 py-2 text-center text-[12px] leading-tight whitespace-normal sm:text-sm ${
                      authMode === 'recovery'
                        ? 'bg-gradient-to-r from-indigo-700 to-violet-600 !text-white shadow-sm hover:from-indigo-800 hover:to-violet-700'
                        : 'bg-white !text-slate-700 hover:bg-indigo-50 hover:!text-indigo-700'
                    }`}
                    onClick={() => {
                      setRegisterConflictBanner('');
                      resetAuthActionState();
                      setAuthMode('recovery');
                    }}
                  >
                    Recover Password
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500 text-center">
                Password recovery uses Firebase reset email{forgotCooldownSeconds > 0 ? ` • cooldown ${forgotCooldownSeconds}s` : ''}
              </div>

              {!isRecoveryMode ? (
                <div className="space-y-2">
                  <div className="relative py-1 text-center text-sm text-slate-500">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-indigo-100" />
                    <span className="relative bg-white px-3 text-slate-500">or continue with</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl border-indigo-200 bg-white !text-slate-700 hover:bg-indigo-50 hover:!text-indigo-800"
                      disabled={isAuthBusy}
                      onClick={() => void handleSocialAuth('google')}
                    >
                      <GoogleLogo className="mr-2 h-4 w-4" />
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl border-indigo-200 bg-white !text-slate-700 hover:bg-indigo-50 hover:!text-indigo-800"
                      disabled={isAuthBusy}
                      onClick={() => void handleSocialAuth('apple')}
                    >
                      <AppleLogo className="mr-2 h-4 w-4" />
                      Apple
                    </Button>
                  </div>
                </div>
              ) : null}

              {authMode === 'login' ? (
                <>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button asChild variant="outline" className="h-11 rounded-xl border-emerald-200 bg-white px-4 !text-emerald-700 shadow-sm hover:bg-emerald-50 hover:!text-emerald-800">
                      <a href={NET360_ADMIN_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        WhatsApp Admin
                      </a>
                    </Button>
                  </div>

                  <div className="mt-6 flex justify-center px-1 sm:mt-8">
                    <img
                      src={loginBannerImageUrl()}
                      alt="NET360"
                      className="h-auto w-full max-w-[min(90vw,500px)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-out hover:scale-[1.02] sm:max-w-[500px]"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
            <Net360UserGuideVideoSection />

            <Card className="relative overflow-hidden rounded-2xl border-indigo-100 bg-gradient-to-br from-white to-[#eef1ff] shadow-[0_14px_32px_rgba(98,113,202,0.12)]">
              <div className="pointer-events-none absolute -left-24 -bottom-16 h-56 w-80 rounded-full bg-indigo-400/12 blur-3xl" />
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-72 rounded-full bg-violet-300/14 blur-3xl" />
              <CardHeader>
                <CardTitle className="text-slate-800">Featured Advertisement</CardTitle>
                <CardDescription className="text-slate-600">Latest update and announcements for NET360 students.</CardDescription>
              </CardHeader>
              <CardContent className="relative pb-7">
                <div className="mx-auto mt-4 flex w-full max-w-[min(100%,680px)] justify-center rounded-2xl border border-indigo-100/80 bg-white/70 p-2 shadow-[0_18px_34px_rgba(79,70,229,0.14)] backdrop-blur-sm">
                  <img
                    src={appPromoImageUrl()}
                    alt="NET360 advertisement"
                    className="mx-auto h-auto w-full max-w-full object-contain rounded-xl"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const completedTests = attempts.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1>Profile & Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <a href={NET360_ADMIN_WHATSAPP_LINK} target="_blank" rel="noreferrer">
            <Button
              variant="outline"
              size="icon"
              className="net360-icon-surface h-10 w-10 rounded-xl border-emerald-300 p-0 hover:bg-emerald-50 dark:border-emerald-500/45 dark:hover:bg-emerald-900/45"
              aria-label="Open WhatsApp chat with admin"
              title="WhatsApp Admin"
            >
              <span className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#25D366] via-[#20c95d] to-[#128C7E] shadow-[inset_0_-2px_5px_rgba(0,0,0,0.22),0_2px_6px_rgba(18,140,126,0.35)]">
                <span className="pointer-events-none absolute inset-x-1 top-0 h-2.5 rounded-full bg-white/35 blur-[0.5px]" />
                <svg viewBox="0 0 24 24" className="relative h-4.5 w-4.5 fill-white" aria-hidden="true">
                  <path d="M19.1 4.9A9.72 9.72 0 0 0 12.03 2C6.67 2 2.3 6.37 2.3 11.73c0 1.72.45 3.39 1.3 4.86L2 22l5.55-1.58a9.7 9.7 0 0 0 4.47 1.14h.01c5.36 0 9.73-4.37 9.73-9.73 0-2.6-1.01-5.03-2.66-6.93ZM12.03 19.9h-.01a8.08 8.08 0 0 1-4.13-1.14l-.3-.18-3.29.94.88-3.2-.2-.33a8.03 8.03 0 0 1-1.24-4.26 8.29 8.29 0 0 1 8.29-8.29c2.21 0 4.29.87 5.85 2.43a8.24 8.24 0 0 1 2.42 5.86 8.29 8.29 0 0 1-8.27 8.17Zm4.54-6.2c-.25-.12-1.5-.74-1.73-.82-.23-.08-.4-.12-.56.13-.17.25-.65.82-.8.99-.15.16-.3.19-.55.06-.25-.13-1.07-.4-2.03-1.27-.75-.67-1.25-1.5-1.4-1.75-.15-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.76-1.84-.2-.49-.41-.42-.56-.42h-.48c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02 0 1.19.87 2.35.99 2.52.12.16 1.72 2.62 4.17 3.68.58.25 1.04.4 1.39.51.58.18 1.11.16 1.53.1.47-.07 1.5-.61 1.71-1.2.21-.58.21-1.08.15-1.2-.06-.1-.23-.16-.48-.28Z" />
                </svg>
              </span>
            </Button>
          </a>
          <Button variant="outline" onClick={() => onNavigate?.('analytics')}>View Analytics</Button>
          <Button variant="outline" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src={getMediaUrl(avatarPreview)} />
                <AvatarFallback className="text-2xl">{avatarText}</AvatarFallback>
              </Avatar>
              <h3>{`${localProfile.firstName || 'Student'} ${localProfile.lastName || ''}`.trim()}</h3>
              <p className="text-sm text-muted-foreground">{localProfile.email || user.email}</p>
              <Button variant="outline" className="mt-4" onClick={triggerPhotoPicker}>Change Photo</Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={handlePhotoSelected}
              />
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs">
                <p className="font-medium text-emerald-900">Need instant help?</p>
                <p className="mt-1 text-emerald-800">WhatsApp admin: {NET360_ADMIN_WHATSAPP}</p>
                <a href={NET360_ADMIN_WHATSAPP_LINK} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-700 underline underline-offset-2">
                  Open WhatsApp Chat
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm">Jan 2026</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white dark:from-amber-400 dark:to-orange-400 dark:text-slate-900">Premium</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tests Taken</span>
                <span className="text-sm">{completedTests}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  {isPersonalInfoExpanded
                    ? 'Your previous details are prefilled. You can update city only.'
                    : 'Saved profile summary. Expand only when you need to edit.'}
                </CardDescription>
              </div>
              {!isPersonalInfoExpanded ? (
                <Button type="button" variant="outline" onClick={() => setIsPersonalInfoExpanded(true)}>
                  Edit Profile
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isPersonalInfoExpanded ? (
              <div className="grid gap-2 rounded-lg border bg-slate-50/70 p-3 text-sm md:grid-cols-2">
                <p><span className="text-muted-foreground">First Name:</span> {localProfile.firstName || 'Not set'}</p>
                <p><span className="text-muted-foreground">Last Name:</span> {localProfile.lastName || 'Not set'}</p>
                <p><span className="text-muted-foreground">Email:</span> {localProfile.email || user.email || 'Not set'}</p>
                <p><span className="text-muted-foreground">Phone:</span> {localProfile.phone || 'Not set'}</p>
                <p className="md:col-span-2"><span className="text-muted-foreground">City:</span> {localProfile.city || 'Not set'}</p>
              </div>
            ) : null}

            {isPersonalInfoExpanded ? (
              <>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input id="first-name" value={localProfile.firstName} disabled placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input id="last-name" value={localProfile.lastName} disabled placeholder="Doe" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={localProfile.email || user.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" value={localProfile.phone} disabled placeholder="+92 300 1234567" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                value={localProfile.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="Enter your city"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={savePersonalInfo}>Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setIsPersonalInfoExpanded(false)}>
                Cancel
              </Button>
            </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                NET Preparation Details
              </CardTitle>
              <CardDescription>
                {isPreparationExpanded
                  ? 'Set your target program and exam details.'
                  : 'Saved preparation summary. Expand when you want to edit.'}
              </CardDescription>
            </div>
            {!isPreparationExpanded ? (
              <Button type="button" variant="outline" onClick={() => setIsPreparationExpanded(true)}>
                Edit Profile
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPreparationExpanded ? (
            <div className="grid gap-2 rounded-lg border bg-slate-50/70 p-3 text-sm md:grid-cols-2">
              <p><span className="text-muted-foreground">Target Program:</span> {selectedTargetProgramLabel || 'Not set'}</p>
              <p><span className="text-muted-foreground">Test Series:</span> {localProfile.testSeries || 'Not set'}</p>
              <p><span className="text-muted-foreground">SSC %:</span> {localProfile.sscPercentage || 'Not set'}</p>
              <p><span className="text-muted-foreground">HSSC %:</span> {localProfile.hsscPercentage || 'Not set'}</p>
              <p className="md:col-span-2"><span className="text-muted-foreground">NET Test Date:</span> {localProfile.testDate || 'Not set'}</p>
            </div>
          ) : null}

          {isPreparationExpanded ? (
            <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-program">Target Program</Label>
              <Select
                value={localProfile.targetProgram || undefined}
                onValueChange={(value) => {
                  void handleTargetProgramSelect(value);
                }}
                disabled={isSavingTargetProgram}
              >
                <SelectTrigger id="target-program" className="h-10">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {targetProgramOptions.map((option) => (
                    <SelectItem key={`${option.category}-${option.value}`} value={option.value}>
                      {option.label} ({option.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSavingTargetProgram ? (
                <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving target program...
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-series">Target Test Series</Label>
              <Select value={localProfile.testSeries} onValueChange={(value) => updateField('testSeries', value)}>
                <SelectTrigger id="test-series">
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="series1">NET Series 1 (Dec 2025)</SelectItem>
                  <SelectItem value="series2">NET Series 2 (Feb 2026)</SelectItem>
                  <SelectItem value="series3">NET Series 3 (Apr 2026)</SelectItem>
                  <SelectItem value="series4">NET Series 4 (Jun 2026)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ssc-percentage">SSC/Matric Percentage</Label>
              <Input id="ssc-percentage" type="number" value={localProfile.sscPercentage} onChange={(e) => updateField('sscPercentage', e.target.value)} placeholder="85" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hssc-percentage">HSSC/Intermediate Percentage</Label>
              <Input id="hssc-percentage" type="number" value={localProfile.hsscPercentage} onChange={(e) => updateField('hsscPercentage', e.target.value)} placeholder="82" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-date">NET Test Date</Label>
            <Input id="test-date" type="date" value={localProfile.testDate} onChange={(e) => updateField('testDate', e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={savePreparationDetails}>Update Details</Button>
            <Button type="button" variant="outline" onClick={() => setIsPreparationExpanded(false)}>
              Cancel
            </Button>
          </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">🏆</div>
              <h4>First Test</h4>
              <p className="text-sm text-muted-foreground">Unlocked when you complete your first test</p>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">⚡</div>
              <h4>Consistency</h4>
              <p className="text-sm text-muted-foreground">Keep practicing daily to build streaks</p>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">📚</div>
              <h4>Question Solver</h4>
              <p className="text-sm text-muted-foreground">Solve 100+ questions to unlock next badge</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4>Email Notifications</h4>
              <p className="text-sm text-muted-foreground">Receive updates about tests and deadlines</p>
            </div>
            <Button variant={preferences.emailNotifications ? 'default' : 'outline'} onClick={() => void togglePreference('emailNotifications')}>
              {preferences.emailNotifications ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4>Daily Reminders</h4>
              <p className="text-sm text-muted-foreground">Get reminded to practice daily</p>
            </div>
            <Button variant={preferences.dailyReminders ? 'default' : 'outline'} onClick={() => void togglePreference('dailyReminders')}>
              {preferences.dailyReminders ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4>Performance Reports</h4>
              <p className="text-sm text-muted-foreground">Weekly summary of your progress</p>
            </div>
            <Button variant={preferences.performanceReports ? 'default' : 'outline'} onClick={() => void togglePreference('performanceReports')}>
              {preferences.performanceReports ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50/40">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-red-700">Danger Zone: Delete Account</CardTitle>
              <CardDescription className="text-red-700/90">
                Deleting your account will permanently remove your access to the platform.
              </CardDescription>
            </div>
            <Button type="button" size="sm" variant="outline" className="border-red-300 bg-white text-red-700 hover:bg-red-50" onClick={toggleDeleteAccountPanel}>
              Delete Account
              {showDeleteAccountPanel ? <ChevronUp className="ml-1.5 h-4 w-4" /> : <ChevronDown className="ml-1.5 h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {showDeleteAccountPanel ? (
          <CardContent className="space-y-3">
            <p className="text-sm text-red-700/90">
              If you want to use the service again in the future, you will need to create a new account and obtain access again.
            </p>

            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation-text">Type DELETE to confirm</Label>
              <Input
                id="delete-account-confirmation-text"
                name="delete-account-confirmation-text"
                autoComplete="off"
                value={deleteAccountConfirmationText}
                onChange={(e) => setDeleteAccountConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="border-red-200 bg-white"
              />
              <p className="text-xs text-red-700/90">Enter DELETE in uppercase to continue.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-account-password">Confirm with your registration password</Label>
              <PasswordInput
                id="delete-account-password"
                name="delete-account-password"
                autoComplete="new-password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                placeholder="Enter password to confirm"
                className="border-red-200 bg-white"
              />
            </div>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteAccount()}
              disabled={isDeletingAccount || !deleteAccountPassword.trim() || deleteAccountConfirmationText.trim() !== 'DELETE'}
            >
              {isDeletingAccount ? 'Deleting Account...' : 'Delete Account Permanently'}
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
