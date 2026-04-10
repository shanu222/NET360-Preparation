import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Award, Bot, ChevronDown, ChevronUp, Copy, FlaskConical, GraduationCap, Loader2, LogOut, MessageCircle, RefreshCw, Settings, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { buildPaymentProofPayload, PAYMENT_PROOF_ACCEPT } from '../lib/paymentProof';
import { NET360_ADMIN_WHATSAPP, NET360_ADMIN_WHATSAPP_LINK, PAYMENT_METHODS } from '../lib/paymentMethods';
import { NET_TARGET_PROGRAM_OPTIONS } from '../lib/netPrograms';

const BRAND_LOGO_SRC = '/net360-logo.png';
const PROFILE_PHOTO_STORAGE_KEY = 'net360-profile-photo-data-url';

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
type AuthActionState = 'idle' | 'loggingIn' | 'creatingAccount' | 'activatingAccount';

export function Profile({ onNavigate }: ProfileProps) {
  const { user, login, submitSignupRequest, registerWithToken, logout } = useAuth();
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
  const paymentProofInputRef = useRef<HTMLInputElement | null>(null);
  const [authMode, setAuthMode] = useState<AuthPanelMode>('login');
  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    mobileNumber: '',
    paymentMethod: 'easypaisa' as 'easypaisa' | 'jazzcash' | 'bank_transfer',
    paymentTransactionId: '',
    paymentProof: null as null | {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    },
    securityQuestion: '',
    securityAnswer: '',
    tokenCode: '',
  });
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSecurityQuestion, setForgotSecurityQuestion] = useState('');
  const [forgotSecurityAnswer, setForgotSecurityAnswer] = useState('');
  const [forgotChallengeToken, setForgotChallengeToken] = useState('');
  const [forgotToken, setForgotToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryHelpMessage, setRecoveryHelpMessage] = useState('');
  const [forgotCooldownSeconds, setForgotCooldownSeconds] = useState(0);
  const [paymentProofReadProgress, setPaymentProofReadProgress] = useState(0);
  const [isReadingPaymentProof, setIsReadingPaymentProof] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [registerConflictBanner, setRegisterConflictBanner] = useState('');
  const [authActionState, setAuthActionState] = useState<AuthActionState>('idle');
  const [signupFlowActive, setSignupFlowActive] = useState(false);
  const [showAuthGuidanceCard, setShowAuthGuidanceCard] = useState(false);
  const [authGuidanceMessage, setAuthGuidanceMessage] = useState('');
  const [showDeleteAccountPanel, setShowDeleteAccountPanel] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountConfirmationText, setDeleteAccountConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isPersonalInfoExpanded, setIsPersonalInfoExpanded] = useState(true);
  const [isPreparationExpanded, setIsPreparationExpanded] = useState(true);
  const [isSavingTargetProgram, setIsSavingTargetProgram] = useState(false);
  const signupGuidanceTimeoutRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (signupGuidanceTimeoutRef.current) {
        window.clearTimeout(signupGuidanceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (authMode !== 'register') return;

    const email = authForm.email.trim();
    const mobileNumber = authForm.mobileNumber.trim();
    if (!email || !mobileNumber) return;

    let cancelled = false;
    let timer: number | null = null;

    const pullSignupToken = async () => {
      try {
        const payload = await apiRequest<{ tokenCode?: string; requestStatus?: string }>('/api/auth/signup-token-inbox', {
          method: 'POST',
          body: JSON.stringify({ email, mobileNumber }),
        });

        if (cancelled || !payload?.tokenCode) return;

        setAuthForm((previous) => {
          if (previous.tokenCode === payload.tokenCode) return previous;
          return {
            ...previous,
            tokenCode: String(payload.tokenCode || '').toUpperCase(),
          };
        });
      } catch {
        // Ignore transient inbox polling errors.
      }
    };

    void pullSignupToken();
    timer = window.setInterval(() => {
      void pullSignupToken();
    }, 12000);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [authMode, authForm.email, authForm.mobileNumber]);

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

  const isValidInternationalWhatsApp = (value: string) => /^\+[1-9]\d{7,14}$/.test(value.trim());

  const clearSignupGuidanceTimeout = () => {
    if (signupGuidanceTimeoutRef.current) {
      window.clearTimeout(signupGuidanceTimeoutRef.current);
      signupGuidanceTimeoutRef.current = null;
    }
  };

  const showTimedSignupGuidance = (message: string) => {
    clearSignupGuidanceTimeout();
    setAuthGuidanceMessage(message);
    setShowAuthGuidanceCard(true);
    signupGuidanceTimeoutRef.current = window.setTimeout(() => {
      setShowAuthGuidanceCard(false);
      signupGuidanceTimeoutRef.current = null;
    }, 10000);
  };

  const resetAuthActionState = () => {
    setAuthActionState('idle');
    setSignupFlowActive(false);
    setAuthGuidanceMessage('');
    setShowAuthGuidanceCard(false);
    clearSignupGuidanceTimeout();
  };

  const activateSignupWithToken = async () => {
    setAuthActionState('activatingAccount');
    await registerWithToken({
      email: authForm.email,
      password: authForm.password,
      tokenCode: authForm.tokenCode,
      firstName: authForm.firstName,
      lastName: authForm.lastName,
      securityQuestion: authForm.securityQuestion,
      securityAnswer: authForm.securityAnswer,
    });
    setSignupFlowActive(false);
    setAuthActionState('idle');
    setShowAuthGuidanceCard(false);
    clearSignupGuidanceTimeout();
    toast.success('Signup completed successfully.');
  };

  useEffect(() => {
    if (!signupFlowActive || !authForm.tokenCode || !authForm.password) return;

    let cancelled = false;
    const autoActivate = async () => {
      try {
        await activateSignupWithToken();
      } catch (error) {
        if (cancelled) return;
        setAuthActionState('creatingAccount');
        const message = error instanceof Error ? error.message : 'Could not activate account yet.';
        toast.error(message);
      }
    };

    void autoActivate();
    return () => {
      cancelled = true;
    };
  }, [
    signupFlowActive,
    authForm.tokenCode,
    authForm.password,
    authForm.email,
    authForm.firstName,
    authForm.lastName,
    authForm.securityQuestion,
    authForm.securityAnswer,
  ]);

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
        if (!authForm.securityQuestion.trim()) {
          toast.error('Security question is required for account recovery.');
          return;
        }

        if (!authForm.securityAnswer.trim()) {
          toast.error('Security answer is required for account recovery.');
          return;
        }

        if (authForm.tokenCode && authForm.password) {
          await activateSignupWithToken();
        } else {
          setAuthActionState('creatingAccount');

          if (!authForm.mobileNumber) {
            setAuthActionState('idle');
            toast.error('Mobile number is required to submit signup request.');
            return;
          }

          if (!authForm.paymentTransactionId) {
            setAuthActionState('idle');
            toast.error('Payment transaction ID is required to submit signup request.');
            return;
          }

          if (!authForm.paymentProof) {
            setAuthActionState('idle');
            toast.error('Upload payment proof (JPG, PNG, or PDF) before submitting.');
            return;
          }

          if (!isValidInternationalWhatsApp(authForm.mobileNumber)) {
            setAuthActionState('idle');
            toast.error('Enter a valid WhatsApp number in international format (e.g. +923XXXXXXXXX).');
            return;
          }

          await submitSignupRequest({
            email: authForm.email,
            firstName: authForm.firstName,
            lastName: authForm.lastName,
            mobileNumber: authForm.mobileNumber,
            paymentMethod: authForm.paymentMethod,
            paymentTransactionId: authForm.paymentTransactionId,
            paymentProof: authForm.paymentProof,
          });
          setSignupFlowActive(true);
          showTimedSignupGuidance(
            'Your request has been submitted. Please wait while the admin verifies your payment and sends your token code here in the app shortly.',
          );
          toast.success('Signup request submitted. Waiting for token code and activation.');
        }
      } else {
        setAuthActionState('loggingIn');
        setAuthGuidanceMessage('Logging in... please wait.');

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
      if (!signupFlowActive) {
        setAuthActionState('idle');
      }
      if (isRegisterMode && typed.status === 409) {
        setRegisterConflictBanner(message);
      }
      toast.error(message);
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (forgotCooldownSeconds > 0) {
      toast.error(`Please wait ${forgotCooldownSeconds}s before requesting another token.`);
      return;
    }

    const identifier = forgotIdentifier.trim() || authForm.email.trim() || authForm.mobileNumber.trim();

    if (!identifier) {
      toast.error('Enter your registered email or mobile number.');
      return;
    }

    try {
      const isEmail = identifier.includes('@');
      const payload = await apiRequest<{ message: string; securityQuestion?: string; challengeToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(isEmail ? { email: identifier } : { mobileNumber: identifier }),
      });

      if (payload.securityQuestion && payload.challengeToken) {
        setForgotSecurityQuestion(payload.securityQuestion);
        setForgotChallengeToken(payload.challengeToken);
        setForgotSecurityAnswer('');
        setForgotToken('');
        setRecoveryHelpMessage('');
        toast.success('Security question loaded. Answer it to continue.');
      } else {
        toast.error(payload.message || 'No recovery question found for this identifier.');
      }
      setForgotCooldownSeconds(30);
    } catch (error) {
      const detailed = error as Error & { status?: number; retryAfterSeconds?: number };
      if (detailed.status === 429) {
        const retryAfter = Math.max(30, Number(detailed.retryAfterSeconds || 60));
        setForgotCooldownSeconds(retryAfter);
        toast.error(`Too many recovery attempts. Try again in ${retryAfter}s.`);
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Could not request password reset.');
    }
  };

  const handleVerifySecurityAnswer = async () => {
    if (!forgotChallengeToken || !forgotSecurityAnswer.trim()) {
      toast.error('Enter the security answer to continue.');
      return;
    }

    try {
      const payload = await apiRequest<{ message: string; resetToken?: string }>('/api/auth/forgot-password/verify-security-answer', {
        method: 'POST',
        body: JSON.stringify({ challengeToken: forgotChallengeToken, securityAnswer: forgotSecurityAnswer }),
      });

      if (!payload.resetToken) {
        toast.error('Could not generate reset token from security verification.');
        return;
      }

      setForgotToken(payload.resetToken);
      setForgotSecurityAnswer('');
      setRecoveryHelpMessage('');
      toast.success(payload.message || 'Security verification successful.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Security verification failed.');
    }
  };

  const handleResetPassword = async () => {
    if (!forgotToken || !newPassword) {
      toast.error('Reset token and new password are required.');
      return;
    }

    try {
      await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: forgotToken, newPassword }),
      });
      toast.success('Password reset successful. You can now log in.');
      setAuthMode('login');
      setNewPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset password.');
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

  const handlePaymentProofSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsReadingPaymentProof(true);
      const payload = await buildPaymentProofPayload(file, (progress) => setPaymentProofReadProgress(progress));
      setAuthForm((prev) => ({
        ...prev,
        paymentProof: payload,
      }));
      toast.success('Payment proof attached.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read payment proof file.');
    } finally {
      setIsReadingPaymentProof(false);
      event.target.value = '';
    }
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

  const copyPaymentValue = async (value: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const temp = document.createElement('textarea');
        temp.value = value;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success(`${label} copied.`);
    } catch {
      toast.error('Could not copy value.');
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

        <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr] xl:grid-cols-[1fr_1.65fr]">
          <Card className="rounded-2xl border-indigo-100 bg-white/92 shadow-[0_14px_32px_rgba(98,113,202,0.12)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-800">
                {isRecoveryMode ? 'Recover Password' : isRegisterMode ? 'Create Account' : 'Login'}
              </CardTitle>
              <CardDescription className="text-slate-600">
                {isRecoveryMode
                  ? 'Enter your registered email or mobile number, answer your security question, then reset your password.'
                  : isRegisterMode
                  ? 'Pay via Easypaisa/JazzCash/Bank Transfer, upload proof, then complete signup after admin approval and in-app code delivery.'
                  : 'Users can only stay logged in on one device at a time.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRecoveryMode ? (
                <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="forgot-identifier">Registered Email or Mobile Number</Label>
                    <Input
                      id="forgot-identifier"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="student@example.com or +923001234567"
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
                    {forgotCooldownSeconds > 0 ? `Retry in ${forgotCooldownSeconds}s` : 'Find Security Question'}
                  </Button>

                  {forgotSecurityQuestion ? (
                    <div className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3">
                      <p className="text-xs font-semibold text-indigo-800">Security Question</p>
                      <p className="text-sm text-slate-700">{forgotSecurityQuestion}</p>
                      <div className="space-y-1">
                        <Label htmlFor="security-answer">Security Answer</Label>
                        <Input
                          id="security-answer"
                          value={forgotSecurityAnswer}
                          onChange={(e) => setForgotSecurityAnswer(e.target.value)}
                          placeholder="Enter your answer"
                          className="h-10 border-indigo-100"
                        />
                      </div>
                      <Button type="button" className="h-10 w-full rounded-lg bg-indigo-600 !text-white hover:bg-indigo-700" onClick={() => void handleVerifySecurityAnswer()}>
                        Verify Security Answer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 w-full text-indigo-700 hover:bg-indigo-50"
                        onClick={() => setRecoveryHelpMessage('Please contact the admin for password recovery.')}
                      >
                        I don't remember the security question or answer
                      </Button>
                      {recoveryHelpMessage ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">{recoveryHelpMessage}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {forgotToken ? (
                    <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="text-xs text-emerald-800">Security verification passed. Set a new password below.</p>
                    </div>
                  ) : null}

                  {forgotToken ? (
                    <div className="space-y-1">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="h-10 border-indigo-100"
                      />
                    </div>
                  ) : null}

                  {forgotToken ? (
                    <Button className="h-10 w-full rounded-lg bg-indigo-600 !text-white hover:bg-indigo-700" onClick={() => void handleResetPassword()}>
                      Set New Password
                    </Button>
                  ) : null}
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

              {isRegisterMode ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mobile-number">Mobile Number</Label>
                  <Input
                    id="mobile-number"
                    value={authForm.mobileNumber}
                    onChange={(e) => {
                      setRegisterConflictBanner('');
                      setAuthForm((prev) => ({ ...prev, mobileNumber: e.target.value }));
                    }}
                    placeholder="e.g. +923001234567"
                    className="h-11 border-indigo-100"
                  />
                  <p className="text-xs text-slate-500">This mobile number is used for account verification and admin approval matching.</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter your password"
                  className="h-11 border-indigo-100"
                />
              </div>

              {isRegisterMode ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="security-question">Security Question</Label>
                    <Input
                      id="security-question"
                      value={authForm.securityQuestion}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, securityQuestion: e.target.value }))}
                      placeholder="e.g. What is your childhood nickname?"
                      className="h-11 border-indigo-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="security-answer">Security Answer</Label>
                    <Input
                      id="security-answer"
                      value={authForm.securityAnswer}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, securityAnswer: e.target.value }))}
                      placeholder="Your answer"
                      className="h-11 border-indigo-100"
                    />
                  </div>
                </div>
              ) : null}

              {isRegisterMode ? (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <button
                      type="button"
                      onClick={() => setShowPaymentMethods((prev) => !prev)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <span className="text-sm font-medium text-emerald-900">Available Payment Methods</span>
                      {showPaymentMethods ? <ChevronUp className="h-4 w-4 text-emerald-700" /> : <ChevronDown className="h-4 w-4 text-emerald-700" />}
                    </button>
                    {showPaymentMethods ? (
                      <div className="mt-3 space-y-2">
                        {(Object.entries(PAYMENT_METHODS) as Array<[keyof typeof PAYMENT_METHODS, (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS]]>).map(([key, method]) => (
                          <div key={key} className="rounded-lg border border-emerald-100 bg-white p-2.5 text-xs text-slate-700">
                            <p className="font-semibold text-emerald-900">{method.label}</p>
                            <p className="mt-1">{method.instructions}</p>
                            {method.holderValue ? (
                              <p className="mt-1.5 text-[11px] text-slate-700">
                                <span className="text-slate-500">{method.holderLabel || 'Account Title'}:</span> {method.holderValue}
                              </p>
                            ) : null}
                            <div className="mt-2 space-y-1.5">
                              {[
                                { label: method.accountLabel, value: method.accountValue, copyable: true },
                                ...(method.extraDetails || []),
                              ].map((detail) => (
                                <div key={`${key}-${detail.label}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                                  <p className="truncate"><span className="text-slate-500">{detail.label}:</span> {detail.value}</p>
                                  {detail.copyable ? (
                                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void copyPaymentValue(detail.value, detail.label)}>
                                      <Copy className="mr-1 h-3 w-3" />
                                      Copy
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-method">Payment Method</Label>
                      <Select
                        value={authForm.paymentMethod}
                        onValueChange={(value: 'easypaisa' | 'jazzcash' | 'bank_transfer') => setAuthForm((prev) => ({ ...prev, paymentMethod: value }))}
                      >
                        <SelectTrigger id="payment-method" className="h-11 border-indigo-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easypaisa">Easypaisa</SelectItem>
                          <SelectItem value="jazzcash">JazzCash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-txid">Transaction ID</Label>
                      <Input
                        id="payment-txid"
                        value={authForm.paymentTransactionId}
                        onChange={(e) => setAuthForm((prev) => ({ ...prev, paymentTransactionId: e.target.value }))}
                        placeholder="Payment reference"
                        className="h-11 border-indigo-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-indigo-900">Payment Proof</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-indigo-200 bg-white !text-indigo-700 hover:bg-indigo-50 hover:!text-indigo-800"
                        onClick={() => paymentProofInputRef.current?.click()}
                      >
                        Upload Proof
                      </Button>
                      <Input
                        ref={paymentProofInputRef}
                        type="file"
                        accept={PAYMENT_PROOF_ACCEPT}
                        className="hidden"
                        onChange={(e) => void handlePaymentProofSelected(e)}
                      />
                    </div>
                    {isReadingPaymentProof ? (
                      <p className="text-xs text-indigo-700">Reading file... {paymentProofReadProgress}%</p>
                    ) : null}
                    {authForm.paymentProof ? (
                      <p className="text-xs text-slate-600">
                        Attached: {authForm.paymentProof.name} ({Math.max(1, Math.round(authForm.paymentProof.size / 1024))} KB)
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">Upload screenshot/PDF receipt so admin can verify payment.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="signup-token">Admin Approval Token (for final signup)</Label>
                    <Input
                      id="signup-token"
                      value={authForm.tokenCode}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, tokenCode: e.target.value.toUpperCase() }))}
                      placeholder="NET-XXXX-XXXX-XXXX"
                      className="h-11 border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Wait please, token code will appear automatically.</p>
                  </div>
                </>
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
                  : authActionState === 'activatingAccount'
                  ? 'Activating account...'
                  : isRegisterMode
                  ? 'Create Account'
                  : 'Sign In'}
              </Button>

              {isAuthBusy ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-100" aria-hidden="true">
                  <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
                </div>
              ) : null}

              {(authActionState === 'loggingIn' || showAuthGuidanceCard || signupFlowActive) && !isRecoveryMode ? (
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
                        : showAuthGuidanceCard
                        ? authGuidanceMessage
                        : 'Creating account... waiting for admin token so your account can be activated automatically.'}
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
                Recovery is automatic after submit{forgotCooldownSeconds > 0 ? ` • cooldown ${forgotCooldownSeconds}s` : ''}
              </div>

              {authMode === 'login' ? (
                <>
                  <div className="relative py-1 text-center text-sm text-slate-500">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-indigo-100" />
                    <span className="relative bg-white px-3 text-slate-500">or continue with</span>
                  </div>

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
                      src="/images/login-banner.png"
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
                  src="/advertisement-page.webp"
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

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src={avatarPreview} />
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
              <Input
                id="delete-account-password"
                name="delete-account-password"
                type="password"
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
