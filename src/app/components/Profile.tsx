import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Apple, Bot, FlaskConical, GraduationCap, LogOut, RefreshCw, Settings, Target, UserRound, Award } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

interface ProfileProps {
  onNavigate?: (section: string) => void;
}

export function Profile({ onNavigate }: ProfileProps) {
  const { user, login, submitSignupRequest, registerWithToken, logout } = useAuth();
  const { profile, preferences, attempts, saveProfile, savePreferences } = useAppData();
  const [localProfile, setLocalProfile] = useState(profile);
  const [avatarPreview, setAvatarPreview] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    paymentMethod: 'easypaisa' as 'easypaisa' | 'jazzcash' | 'hbl',
    paymentTransactionId: '',
    tokenCode: '',
  });
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotToken, setForgotToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const avatarText = useMemo(() => {
    const first = localProfile.firstName?.trim()[0] ?? 'S';
    const last = localProfile.lastName?.trim()[0] ?? 'T';
    return `${first}${last}`.toUpperCase();
  }, [localProfile.firstName, localProfile.lastName]);

  const updateField = (key: keyof typeof localProfile, value: string) => {
    setLocalProfile((previous) => ({ ...previous, [key]: value }));
  };

  const handleAuthSubmit = async () => {
    try {
      if (!authForm.email) {
        toast.error('Email is required.');
        return;
      }

      if (isRegisterMode) {
        if (authForm.tokenCode && authForm.password) {
          await registerWithToken({
            email: authForm.email,
            password: authForm.password,
            tokenCode: authForm.tokenCode,
            firstName: authForm.firstName,
            lastName: authForm.lastName,
          });
          toast.success('Signup completed successfully.');
        } else {
          if (!authForm.paymentTransactionId) {
            toast.error('Payment transaction ID is required to submit signup request.');
            return;
          }

          await submitSignupRequest({
            email: authForm.email,
            firstName: authForm.firstName,
            lastName: authForm.lastName,
            paymentMethod: authForm.paymentMethod,
            paymentTransactionId: authForm.paymentTransactionId,
          });
          toast.success('Signup request submitted. Wait for admin approval, then use token to complete signup.');
        }
      } else {
        if (!authForm.password) {
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
            if (!shouldSwitch) return;
            await login(authForm.email, authForm.password, { forceLogoutOtherDevice: true });
          } else {
            throw error;
          }
        }
        toast.success('Logged in successfully.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      toast.error(message);
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (!authForm.email) {
      toast.error('Enter your email to request a reset link.');
      return;
    }

    try {
      const payload = await apiRequest<{ message: string; resetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email }),
      });

      if (payload.resetToken) {
        setForgotToken(payload.resetToken);
      }
      toast.success(payload.message || 'Reset link requested.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not request password reset.');
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
      setForgotMode(false);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update details.');
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

    const nextUrl = URL.createObjectURL(file);
    setAvatarPreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
    toast.success('Profile photo updated locally for this browser session.');
  };

  if (!user) {
    return (
      <div className="space-y-5">
        <div>
          <h1>Account Access</h1>
          <p className="text-muted-foreground">Login or register to enable server-backed sessions, auth, and report export</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.65fr]">
          <Card className="rounded-2xl border-indigo-100 bg-white/92 shadow-[0_14px_32px_rgba(98,113,202,0.12)]">
            <CardHeader className="pb-3">
              <CardTitle>{isRegisterMode ? 'Create Account' : 'Login'}</CardTitle>
              <CardDescription>
                {isRegisterMode
                  ? 'Pay via Easypaisa/JazzCash/HBL, submit transaction ID, then complete signup with admin-issued token.'
                  : 'Users can only stay logged in on one device at a time.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRegisterMode ? (
                <div className="grid grid-cols-2 gap-2">
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
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="student@example.com"
                  className="h-11 border-indigo-100"
                />
              </div>

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
                <>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-method">Payment Method</Label>
                      <Select
                        value={authForm.paymentMethod}
                        onValueChange={(value: 'easypaisa' | 'jazzcash' | 'hbl') => setAuthForm((prev) => ({ ...prev, paymentMethod: value }))}
                      >
                        <SelectTrigger id="payment-method" className="h-11 border-indigo-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easypaisa">Easypaisa</SelectItem>
                          <SelectItem value="jazzcash">JazzCash</SelectItem>
                          <SelectItem value="hbl">HBL</SelectItem>
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

                  <div className="space-y-1.5">
                    <Label htmlFor="signup-token">Admin Approval Token (for final signup)</Label>
                    <Input
                      id="signup-token"
                      value={authForm.tokenCode}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, tokenCode: e.target.value.toUpperCase() }))}
                      placeholder="NET-XXXX-XXXX-XXXX"
                      className="h-11 border-indigo-100"
                    />
                  </div>
                </>
              ) : null}

              {forgotMode ? (
                <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="reset-token">Reset Token</Label>
                    <Input
                      id="reset-token"
                      value={forgotToken}
                      onChange={(e) => setForgotToken(e.target.value)}
                      placeholder="Paste reset token"
                      className="h-10 border-indigo-100"
                    />
                  </div>
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
                  <Button className="h-10 w-full rounded-lg bg-indigo-600 text-white" onClick={() => void handleResetPassword()}>
                    Set New Password
                  </Button>
                </div>
              ) : null}

              <Button className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white" onClick={handleAuthSubmit}>
                {isRegisterMode ? 'Create Account' : 'Login'}
              </Button>

              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-indigo-200 bg-white text-indigo-700"
                  onClick={() => setIsRegisterMode((prev) => !prev)}
                >
                  {isRegisterMode ? 'Use Login' : 'Create Account'}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-11 rounded-xl border-indigo-200 bg-white p-0 text-indigo-500"
                  onClick={() => {
                    setAuthForm({
                      firstName: '',
                      lastName: '',
                      email: '',
                      password: '',
                      paymentMethod: 'easypaisa',
                      paymentTransactionId: '',
                      tokenCode: '',
                    });
                    setForgotToken('');
                    setNewPassword('');
                    setForgotMode(false);
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-11 rounded-xl border-indigo-200 bg-white p-0 text-indigo-500"
                  onClick={() => setIsRegisterMode((prev) => !prev)}
                >
                  <UserRound className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setForgotMode((prev) => !prev)}>
                  {forgotMode ? 'Hide reset panel' : 'Forgot password?'}
                </button>
                {!forgotMode ? (
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => void handleForgotPasswordRequest()}>
                    Request reset token
                  </button>
                ) : null}
              </div>

              <div className="relative py-1 text-center text-sm text-slate-500">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-indigo-100" />
                <span className="relative bg-white px-3">or continue with</span>
              </div>

              <div className="flex justify-center gap-3">
                <Button variant="outline" className="h-10 w-16 rounded-xl border-indigo-200 bg-white text-lg text-slate-700">G</Button>
                <Button variant="outline" className="h-10 w-16 rounded-xl border-indigo-200 bg-white text-slate-700">
                  <Apple className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-2xl border-indigo-100 bg-gradient-to-br from-white to-[#eef1ff] shadow-[0_14px_32px_rgba(98,113,202,0.12)]">
            <div className="pointer-events-none absolute -left-24 -bottom-16 h-56 w-80 rounded-full bg-indigo-400/12 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-72 rounded-full bg-violet-300/14 blur-3xl" />
            <CardHeader>
              <CardTitle>Your Result</CardTitle>
              <CardDescription>Login or register to sync your email, account access, and progress.</CardDescription>
            </CardHeader>
            <CardContent className="relative pb-7">
              <div className="mx-auto mt-4 flex h-56 max-w-md items-end justify-center gap-3 rounded-2xl bg-gradient-to-b from-[#f9faff] to-[#edf1ff] p-4">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-500 shadow-sm">
                  <Bot className="h-8 w-8" />
                </div>
                <div className="inline-flex h-20 w-28 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                  <GraduationCap className="h-10 w-10" />
                </div>
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-500 shadow-sm">
                  <FlaskConical className="h-8 w-8" />
                </div>
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1>Profile & Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>
        <div className="flex gap-2">
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm">Jan 2026</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge>Premium</Badge>
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
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input id="first-name" value={localProfile.firstName} onChange={(e) => updateField('firstName', e.target.value)} placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input id="last-name" value={localProfile.lastName} onChange={(e) => updateField('lastName', e.target.value)} placeholder="Doe" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={localProfile.email || user.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" value={localProfile.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+92 300 1234567" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Select value={localProfile.city} onValueChange={(value) => updateField('city', value)}>
                <SelectTrigger id="city">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="islamabad">Islamabad</SelectItem>
                  <SelectItem value="rawalpindi">Rawalpindi</SelectItem>
                  <SelectItem value="lahore">Lahore</SelectItem>
                  <SelectItem value="karachi">Karachi</SelectItem>
                  <SelectItem value="peshawar">Peshawar</SelectItem>
                  <SelectItem value="quetta">Quetta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={savePersonalInfo}>Save Changes</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            NET Preparation Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-program">Target Program</Label>
              <Select value={localProfile.targetProgram} onValueChange={(value) => updateField('targetProgram', value)}>
                <SelectTrigger id="target-program">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cs">Computer Science</SelectItem>
                  <SelectItem value="ee">Electrical Engineering</SelectItem>
                  <SelectItem value="me">Mechanical Engineering</SelectItem>
                  <SelectItem value="ai">Artificial Intelligence</SelectItem>
                  <SelectItem value="se">Software Engineering</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-series">Target Test Series</Label>
              <Select value={localProfile.testSeries} onValueChange={(value) => updateField('testSeries', value)}>
                <SelectTrigger id="test-series">
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
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

          <Button onClick={savePreparationDetails}>Update Details</Button>
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
    </div>
  );
}
