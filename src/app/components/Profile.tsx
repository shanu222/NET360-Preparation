import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Target, Award, Settings, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';

export function Profile() {
  const { user, login, submitSignupRequest, registerWithToken, logout } = useAuth();
  const { profile, preferences, attempts, saveProfile, savePreferences } = useAppData();
  const [localProfile, setLocalProfile] = useState(profile);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    paymentReference: '',
    tokenCode: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string>(() => localStorage.getItem('net360-avatar-preview') || '');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

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
          toast.success('Signup approved and account created.');
        } else {
          if (!authForm.paymentReference) {
            toast.error('Payment reference is required to submit signup request.');
            return;
          }
          await submitSignupRequest({
            email: authForm.email,
            firstName: authForm.firstName,
            lastName: authForm.lastName,
            paymentReference: authForm.paymentReference,
          });
          toast.success('Signup request submitted. Enter token code here after admin approval.');
        }
      } else {
        if (!authForm.password) {
          toast.error('Password is required.');
          return;
        }

        try {
          await login(authForm.email, authForm.password);
        } catch (error) {
          const activeSessionError = error as Error & { code?: string };
          if (activeSessionError?.code === 'active_session_exists') {
            const shouldSwitch = window.confirm(
              'This account is active on another device. Logout there and continue on this device?',
            );
            if (shouldSwitch) {
              await login(authForm.email, authForm.password, { forceLogoutOtherDevice: true });
            } else {
              return;
            }
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

  const openPhotoPicker = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    const maxSizeBytes = 3 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Image must be 3MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setAvatarPreview(dataUrl);
      localStorage.setItem('net360-avatar-preview', dataUrl);
      toast.success('Profile photo updated.');
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1>Account Access</h1>
          <p className="text-muted-foreground">Login or complete token-based signup after payment verification</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isRegisterMode ? 'Token Signup' : 'Login'}</CardTitle>
            <CardDescription>
              {isRegisterMode
                ? '1) Pay fee and submit request 2) after approval, enter token + password'
                : 'Single-device session is enforced'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRegisterMode ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-first-name">First Name</Label>
                  <Input
                    id="reg-first-name"
                    value={authForm.firstName}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-last-name">Last Name</Label>
                  <Input
                    id="reg-last-name"
                    value={authForm.lastName}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="student@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter your password"
              />
            </div>

            {isRegisterMode ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Payment Reference</Label>
                  <Input
                    id="payment-reference"
                    value={authForm.paymentReference}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, paymentReference: e.target.value }))}
                    placeholder="Txn ID / Receipt Number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="token-code">Approved Token Code</Label>
                  <Input
                    id="token-code"
                    value={authForm.tokenCode}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, tokenCode: e.target.value.toUpperCase() }))}
                    placeholder="NET-XXXXX-XXXXX"
                  />
                </div>
              </>
            ) : null}

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleAuthSubmit}>
                {isRegisterMode ? 'Request/Complete Signup' : 'Login'}
              </Button>
              <Button variant="outline" onClick={() => setIsRegisterMode((prev) => !prev)}>
                {isRegisterMode ? 'Use Login' : 'Create Account'}
              </Button>
            </div>
          </CardContent>
        </Card>
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
        <Button variant="outline" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback className="text-2xl">{avatarText}</AvatarFallback>
              </Avatar>
              <h3>{`${localProfile.firstName || 'Student'} ${localProfile.lastName || ''}`.trim()}</h3>
              <p className="text-sm text-muted-foreground">{localProfile.email || user.email}</p>
              <Button variant="outline" className="mt-4" onClick={openPhotoPicker}>Change Photo</Button>
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
