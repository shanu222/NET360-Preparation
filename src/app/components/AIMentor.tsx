import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import {
  Brain,
  Calendar,
  CheckCircle2,
  Clock3,
  Crown,
  FileQuestion,
  Lock,
  MessageSquare,
  ScanLine,
  Send,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { buildPaymentProofPayload, PAYMENT_PROOF_ACCEPT } from '../lib/paymentProof';

interface AIMentorProps {
  onNavigate?: (section: string) => void;
}

const quickPrompts = [
  'Explain integration techniques for NET.',
  'How do I solve electromagnetism MCQs faster?',
  'Give me a quick organic chemistry revision strategy.',
  'Revise trigonometric identities with common mistakes.',
  'How should I approach Newton laws questions?',
  'Give me top grammar rules for sentence correction.',
];

interface StudyPlan {
  generatedAt: string;
  targetDate: string;
  daysLeft: number;
  preparationLevel: string;
  weakSubjects: string[];
  dailyStudyHours: number;
  weeklyTargets: Array<{ week: number; focus: string; target: string }>;
  dailySchedule: Array<{ block: string; durationHours: number; activity: string }>;
  roadmap: string[];
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  billingCycle: string;
  pricePkr: number;
  dailyAiLimit: number;
  features: string[];
}

interface SubscriptionInfo {
  status: string;
  planId: string;
  billingCycle: string;
  startedAt: string | null;
  expiresAt: string | null;
  paymentReference: string;
  lastActivatedAt: string | null;
  isActive: boolean;
  planName: string;
  dailyAiLimit: number;
}

interface UsageInfo {
  day?: string;
  chatCount?: number;
  solverCount?: number;
  tokenConsumed?: number;
  usedToday?: number;
  remainingToday?: number;
}

interface SubscriptionPayload {
  subscription: SubscriptionInfo;
  activationRequest?: PremiumActivationRequest | null;
  usage?: UsageInfo;
}

interface ActivationWithTokenResponse {
  ok?: boolean;
  subscription?: SubscriptionInfo;
  activationRequest?: PremiumActivationRequest | null;
  usage?: UsageInfo;
}

interface SubscriptionRefreshResult {
  subscription: SubscriptionInfo;
  activationRequest?: PremiumActivationRequest | null;
  usage?: UsageInfo;
}

const PREMIUM_SUBSCRIPTION_CACHE_PREFIX = 'net360-premium-subscription';

interface PremiumActivationRequest {
  id: string;
  planId: string;
  planName: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  paymentTransactionId: string;
  paymentProof: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  };
  contactMethod: 'whatsapp';
  contactValue: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  createdAt: string | null;
}

interface SolverPayload {
  questionText: string;
  detected: {
    subject: string;
    topic: string;
  };
  result: {
    conceptExplanation: string;
    stepByStepSolution: string[];
    finalAnswer: string;
    shortestTrick: string;
  };
  usage: UsageInfo;
}

const emptySubscription: SubscriptionInfo = {
  status: 'inactive',
  planId: '',
  billingCycle: '',
  startedAt: null,
  expiresAt: null,
  paymentReference: '',
  lastActivatedAt: null,
  isActive: false,
  planName: '',
  dailyAiLimit: 0,
};

function isSubscriptionActiveNow(subscription?: Partial<SubscriptionInfo> | null) {
  if (!subscription || subscription.status !== 'active') return false;
  if (!subscription.expiresAt) return false;
  return new Date(subscription.expiresAt).getTime() > Date.now();
}

function normalizeSubscriptionForUi(subscription?: Partial<SubscriptionInfo> | null): SubscriptionInfo {
  const merged = { ...emptySubscription, ...(subscription || {}) };
  return {
    ...merged,
    isActive: isSubscriptionActiveNow(merged),
  };
}

function getPremiumCacheKey(userId: string) {
  return `${PREMIUM_SUBSCRIPTION_CACHE_PREFIX}:${userId}`;
}

function readCachedPremiumSubscription(userId: string): SubscriptionInfo | null {
  try {
    const raw = localStorage.getItem(getPremiumCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SubscriptionInfo>;
    const normalized = normalizeSubscriptionForUi(parsed);
    if (!normalized.isActive) {
      localStorage.removeItem(getPremiumCacheKey(userId));
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function writeCachedPremiumSubscription(userId: string, subscription: SubscriptionInfo) {
  try {
    if (subscription.isActive) {
      localStorage.setItem(getPremiumCacheKey(userId), JSON.stringify(subscription));
      return;
    }
    localStorage.removeItem(getPremiumCacheKey(userId));
  } catch {
    // Ignore storage errors (private mode/quota), server state still remains source of truth.
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.readAsDataURL(file);
  });
}

export function AIMentor({ onNavigate }: AIMentorProps) {
  const { token, user } = useAuth();
  const [question, setQuestion] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [dailyHours, setDailyHours] = useState('4');
  const [currentLevel, setCurrentLevel] = useState('');
  const [weakSubjectsText, setWeakSubjectsText] = useState('mathematics, physics');
  const [planData, setPlanData] = useState<StudyPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isSubmittingActivationRequest, setIsSubmittingActivationRequest] = useState(false);
  const [isActivatingWithToken, setIsActivatingWithToken] = useState(false);
  const [isSolving, setIsSolving] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'easypaisa' | 'jazzcash' | 'bank_transfer'>('easypaisa');
  const [paymentTransactionId, setPaymentTransactionId] = useState('');
  const [contactMethod, setContactMethod] = useState<'whatsapp'>('whatsapp');
  const [contactValue, setContactValue] = useState('');
  const [paymentProof, setPaymentProof] = useState<null | {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  }>(null);
  const [premiumProofReadProgress, setPremiumProofReadProgress] = useState(0);
  const [isReadingPremiumProof, setIsReadingPremiumProof] = useState(false);
  const [activationTokenCode, setActivationTokenCode] = useState('');
  const [activationRequest, setActivationRequest] = useState<PremiumActivationRequest | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(emptySubscription);
  const [aiUsage, setAiUsage] = useState<UsageInfo | null>(null);
  const subscriptionRef = useRef<SubscriptionInfo>(emptySubscription);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const premiumProofInputRef = useRef<HTMLInputElement | null>(null);
  const [solverImageName, setSolverImageName] = useState('');
  const [solverMimeType, setSolverMimeType] = useState('');
  const [solverImageDataUrl, setSolverImageDataUrl] = useState('');
  const [solverQuestionText, setSolverQuestionText] = useState('');
  const [solverResult, setSolverResult] = useState<SolverPayload | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([
    { role: 'ai', message: "Hi! I'm your Smart Study Mentor for NET preparation. Ask me any concept or past-paper question." },
  ]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );

  const applySubscription = (nextSubscription?: Partial<SubscriptionInfo> | null) => {
    const normalized = normalizeSubscriptionForUi(nextSubscription);
    const current = subscriptionRef.current;
    // Do not downgrade an already-active subscription unless it is truly expired.
    const shouldKeepCurrentActive = current.isActive && isSubscriptionActiveNow(current) && !normalized.isActive;
    const resolved = shouldKeepCurrentActive ? normalizeSubscriptionForUi(current) : normalized;

    subscriptionRef.current = resolved;
    setSubscription(resolved);
    if (user?.id) {
      writeCachedPremiumSubscription(user.id, resolved);
    }
    return resolved;
  };

  useEffect(() => {
    if (!token || !user) {
      setPlanData(null);
      setSubscription(emptySubscription);
      subscriptionRef.current = emptySubscription;
      setActivationRequest(null);
      return;
    }

    let cancelled = false;

    const cachedSubscription = readCachedPremiumSubscription(user.id);
    if (cachedSubscription) {
      applySubscription(cachedSubscription);
    }

    async function bootstrap() {
      try {
        setIsLoadingSubscription(true);
        const [latestPlan, plansPayload, mePayload] = await Promise.all([
          apiRequest<{ studyPlan: StudyPlan | null }>('/api/study-plans/latest', {}, token).catch(() => ({ studyPlan: null })),
          apiRequest<{ plans: SubscriptionPlan[] }>('/api/subscriptions/plans', {}, token).catch(() => ({ plans: [] })),
          apiRequest<SubscriptionPayload>('/api/subscriptions/me', {}, token).catch(() => null),
        ]);

        if (cancelled) return;

        if (latestPlan.studyPlan) {
          setPlanData(latestPlan.studyPlan);
          setTargetDate(latestPlan.studyPlan.targetDate || '');
          setCurrentLevel(latestPlan.studyPlan.preparationLevel || '');
          setDailyHours(String(latestPlan.studyPlan.dailyStudyHours || 4));
          setWeakSubjectsText((latestPlan.studyPlan.weakSubjects || []).join(', '));
        }

        setPlans(plansPayload.plans || []);
        if (mePayload?.subscription) {
          applySubscription(mePayload.subscription);
          setActivationRequest(mePayload.activationRequest || null);
          setAiUsage(mePayload.usage || null);
        }

        if (!selectedPlanId && plansPayload.plans?.length) {
          const recommended = plansPayload.plans.find((item) => item.tier === 'pro' && item.billingCycle === 'monthly');
          setSelectedPlanId((recommended || plansPayload.plans[0]).id);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSubscription(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const reloadSubscription = async (): Promise<SubscriptionRefreshResult | null> => {
    if (!token) return null;
    try {
      const mePayload = await apiRequest<SubscriptionPayload>('/api/subscriptions/me', {}, token);
      const normalizedSubscription = applySubscription(mePayload.subscription || emptySubscription);
      setActivationRequest(mePayload.activationRequest || null);
      setAiUsage(mePayload.usage || null);
      return {
        subscription: normalizedSubscription,
        activationRequest: mePayload.activationRequest || null,
        usage: mePayload.usage || null,
      };
    } catch {
      // Keep current state on transient errors so a freshly activated plan does not appear locked.
      return null;
    }
  };

  const askQuestion = async () => {
    if (!question.trim()) return;

    if (!token || !user) {
      toast.error('Login required to use Smart Study Mentor.');
      return;
    }

    const userMessage = { role: 'user' as const, message: question.trim() };
    setChatMessages((previous) => [...previous, userMessage]);
    setQuestion('');
    setIsAskingAI(true);

    try {
      const payload = await apiRequest<{ answer: string; usage?: { usedToday: number; remainingToday: number } }>(
        '/api/ai/mentor/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            message: userMessage.message,
            context: 'NET prep assistant mode',
          }),
        },
        token,
      );

      setChatMessages((previous) => [...previous, { role: 'ai', message: payload.answer }]);
      if (payload.usage) {
        setAiUsage((previous) => ({ ...previous, ...payload.usage }));
      }
    } catch (error) {
      const appError = error as { message?: string; code?: string };
      if (appError?.code === 'SUBSCRIPTION_REQUIRED') {
        const refreshed = await reloadSubscription();
        if (!refreshed?.subscription?.isActive) {
          if (subscription.isActive && isSubscriptionActiveNow(subscription)) {
            toast.error('Could not verify premium status right now. Please retry in a moment.');
          } else {
            applySubscription(emptySubscription);
            toast.error('Premium subscription required. Please activate a plan first.');
          }
        } else {
          toast.error('Your premium status is active. Please retry your request.');
        }
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not reach the study mentor right now.');
      }
      setChatMessages((previous) => [
        ...previous,
        {
          role: 'ai',
          message: 'Detailed solution could not be prepared right now. Please retry your question.',
        },
      ]);
    } finally {
      setIsAskingAI(false);
    }
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleChoosePremiumProof = () => {
    premiumProofInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type.toLowerCase())) {
      toast.error('Only JPG and PNG are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Please upload an image under 5MB.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setSolverImageName(file.name);
      setSolverMimeType(file.type);
      setSolverImageDataUrl(dataUrl);
      toast.success(`Selected image: ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read image file.');
    }
  };

  const handlePremiumProofChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsReadingPremiumProof(true);
      const payload = await buildPaymentProofPayload(file, (progress) => setPremiumProofReadProgress(progress));
      setPaymentProof(payload);
      toast.success('Payment proof attached.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read payment proof file.');
    } finally {
      setIsReadingPremiumProof(false);
      event.target.value = '';
    }
  };

  const isValidInternationalWhatsApp = (value: string) => /^\+[1-9]\d{7,14}$/.test(value.trim());

  const solveQuestion = async () => {
    if (!token || !user) {
      toast.error('Login required to use premium solver.');
      return;
    }

    if (!solverImageDataUrl && !solverQuestionText.trim()) {
      toast.error('Upload an image or paste question text first.');
      return;
    }

    setIsSolving(true);
    try {
      const payload = await apiRequest<SolverPayload>(
        '/api/ai/mentor/solve-image',
        {
          method: 'POST',
          body: JSON.stringify({
            imageDataUrl: solverImageDataUrl,
            questionText: solverQuestionText,
            mimeType: solverMimeType,
          }),
        },
        token,
      );

      setSolverResult(payload);
      setAiUsage((previous) => ({ ...previous, ...payload.usage }));
      toast.success('Question solved successfully.');
    } catch (error) {
      const appError = error as { message?: string; code?: string };
      if (appError?.code === 'SUBSCRIPTION_REQUIRED') {
        const refreshed = await reloadSubscription();
        if (!refreshed?.subscription?.isActive) {
          if (subscription.isActive && isSubscriptionActiveNow(subscription)) {
            toast.error('Could not verify premium status right now. Please retry in a moment.');
          } else {
            applySubscription(emptySubscription);
            toast.error('Premium subscription required. Please activate a plan first.');
          }
        } else {
          toast.error('Your premium status is active. Please retry your request.');
        }
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not solve this question right now.');
      }
    } finally {
      setIsSolving(false);
    }
  };

  const submitActivationRequest = async () => {
    if (!token || !user) {
      toast.error('Please login first.');
      return;
    }

    if (!selectedPlanId) {
      toast.error('Please choose a subscription plan.');
      return;
    }

    if (!paymentTransactionId.trim()) {
      toast.error('Enter payment transaction ID.');
      return;
    }

    if (!paymentProof) {
      toast.error('Upload payment proof before submitting activation request.');
      return;
    }

    if (!contactValue.trim()) {
      toast.error('Enter contact details to receive your activation token.');
      return;
    }

    if (!isValidInternationalWhatsApp(contactValue)) {
      toast.error('Enter a valid WhatsApp number in international format (e.g. +923XXXXXXXXX).');
      return;
    }

    setIsSubmittingActivationRequest(true);
    try {
      await apiRequest<{ request: PremiumActivationRequest }>(
        '/api/subscriptions/request-activation',
        {
          method: 'POST',
          body: JSON.stringify({
            planId: selectedPlanId,
            paymentMethod,
            paymentTransactionId: paymentTransactionId.trim(),
            paymentProof,
            contactMethod,
            contactValue: contactValue.trim(),
          }),
        },
        token,
      );
      await reloadSubscription();
      setPaymentTransactionId('');
      setPaymentProof(null);
      toast.success('Activation request submitted. Admin will verify and send your token.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit activation request.');
    } finally {
      setIsSubmittingActivationRequest(false);
    }
  };

  const activateWithToken = async () => {
    if (!token || !user) {
      toast.error('Please login first.');
      return;
    }

    if (!activationTokenCode.trim()) {
      toast.error('Enter admin-issued activation token.');
      return;
    }

    setIsActivatingWithToken(true);
    try {
      const activationPayload = await apiRequest<ActivationWithTokenResponse>(
        '/api/subscriptions/activate-with-token',
        {
          method: 'POST',
          body: JSON.stringify({ tokenCode: activationTokenCode.trim().toUpperCase() }),
        },
        token,
      );

      if (activationPayload.subscription) {
        applySubscription(activationPayload.subscription);
      }
      if (activationPayload.activationRequest !== undefined) {
        setActivationRequest(activationPayload.activationRequest || null);
      }
      if (activationPayload.usage) {
        setAiUsage((previous) => ({ ...previous, ...activationPayload.usage }));
      }

      setActivationTokenCode('');
      await reloadSubscription();
      toast.success('Subscription activated successfully. Smart Study Mentor unlocked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not activate subscription with token.');
    } finally {
      setIsActivatingWithToken(false);
    }
  };

  const generateStudyPlan = async () => {
    if (!token || !user) {
      toast.error('Login required to save a study plan.');
      return;
    }

    if (!targetDate || !currentLevel || !dailyHours) {
      toast.error('Please set target date, level, and daily hours first.');
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const weakSubjects = weakSubjectsText
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const payload = await apiRequest<{ studyPlan: StudyPlan }>(
        '/api/study-plans/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            targetDate,
            preparationLevel: currentLevel,
            dailyStudyHours: Number(dailyHours),
            weakSubjects,
          }),
        },
        token,
      );

      setPlanData(payload.studyPlan);
      toast.success('Study plan generated and saved to your account.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate study plan.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#ecefff] via-[#ece8ff] to-[#f5e6f8] p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(172,149,255,0.26),transparent_35%),radial-gradient(circle_at_16%_80%,rgba(129,180,255,0.18),transparent_30%)]" />
        <div className="relative">
          <h1 className="inline-flex items-center gap-2 text-indigo-950">
            <Brain className="h-7 w-7" />
            Smart Study Mentor Premium
          </h1>
          <p className="text-slate-600">Subscription-based academic guidance, OCR solving, and personalized planning</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatPill icon={Crown} label="Premium Access" />
            <StatPill icon={ScanLine} label="OCR Solver" />
            <StatPill icon={Calendar} label="Smart Study Planner" />
          </div>
        </div>
      </section>

      {isLoadingSubscription ? (
        <Card className="rounded-2xl border-indigo-100 bg-white/92">
          <CardContent className="py-10 text-center text-slate-600">Checking your subscription status...</CardContent>
        </Card>
      ) : !subscription.isActive ? (
        <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
          <Card className="rounded-2xl border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-amber-900">
                <Lock className="h-5 w-5" />
                Premium Subscription Required
              </CardTitle>
              <CardDescription>
                Premium guidance features are locked. Activate a plan to unlock doubt support, OCR solving, and higher daily guidance limits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selectedPlanId === plan.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-indigo-950">{plan.name}</p>
                      <Badge variant={plan.tier === 'pro' ? 'default' : 'outline'}>{plan.tier}</Badge>
                    </div>
                    <p className="text-lg font-semibold text-slate-900">PKR {plan.pricePkr}</p>
                    <p className="text-xs text-slate-500">{plan.billingCycle} billing</p>
                    <p className="mt-2 text-xs text-slate-600">Daily guidance limit: {plan.dailyAiLimit}</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {plan.features.map((item) => (
                        <li key={`${plan.id}-${item}`} className="inline-flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-indigo-100 bg-white/95">
            <CardHeader>
              <CardTitle className="text-xl text-indigo-950">Activate Plan</CardTitle>
              <CardDescription>Submit payment proof, wait for admin verification, then activate with token</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-select">Selected Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger id="plan-select" className="border-indigo-100">
                    <SelectValue placeholder="Choose subscription plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - PKR {plan.pricePkr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="premium-payment-method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={(value: 'easypaisa' | 'jazzcash' | 'bank_transfer') => setPaymentMethod(value)}>
                    <SelectTrigger id="premium-payment-method" className="border-indigo-100">
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
                  <Label htmlFor="premium-payment-tx">Transaction ID</Label>
                  <Input
                    id="premium-payment-tx"
                    value={paymentTransactionId}
                    onChange={(e) => setPaymentTransactionId(e.target.value)}
                    placeholder="e.g. TXN-239482"
                    className="border-indigo-100"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="premium-contact-method">Token Delivery Method</Label>
                  <Select value={contactMethod} onValueChange={() => setContactMethod('whatsapp')}>
                    <SelectTrigger id="premium-contact-method" className="border-indigo-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="premium-contact-value">WhatsApp Number</Label>
                  <Input
                    id="premium-contact-value"
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder="+923XXXXXXXXX"
                    className="border-indigo-100"
                  />
                  <p className="text-xs text-slate-500">Use international format with country code (e.g. +923001234567).</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span>Payment proof (JPG, PNG, PDF)</span>
                  <Button type="button" variant="outline" size="sm" onClick={handleChoosePremiumProof}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload
                  </Button>
                </div>
                <Input
                  ref={premiumProofInputRef}
                  type="file"
                  accept={PAYMENT_PROOF_ACCEPT}
                  className="hidden"
                  onChange={(e) => void handlePremiumProofChange(e)}
                />
                {isReadingPremiumProof ? <p>Reading file... {premiumProofReadProgress}%</p> : null}
                <p>{paymentProof ? `Attached: ${paymentProof.name}` : 'Attach receipt/screenshot for admin verification.'}</p>
              </div>

              {selectedPlan ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-700">
                  {selectedPlan.name}: PKR {selectedPlan.pricePkr} ({selectedPlan.billingCycle})
                </div>
              ) : null}

              {activationRequest ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                  <p>
                    Latest request: <strong>{activationRequest.status.toUpperCase()}</strong>
                  </p>
                  <p>
                    Plan: {activationRequest.planName || activationRequest.planId} | Txn: {activationRequest.paymentTransactionId}
                  </p>
                  {activationRequest.notes ? <p>Admin note: {activationRequest.notes}</p> : null}
                </div>
              ) : null}

              <Button onClick={() => void submitActivationRequest()} disabled={isSubmittingActivationRequest} className="w-full">
                {isSubmittingActivationRequest ? 'Submitting Request...' : 'Submit Activation Request'}
              </Button>

              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                <Label htmlFor="premium-activation-token">Activation Token</Label>
                <Input
                  id="premium-activation-token"
                  value={activationTokenCode}
                  onChange={(e) => setActivationTokenCode(e.target.value.toUpperCase())}
                  placeholder="PREM-XXXX-XXXX-XXXX"
                  className="border-emerald-200"
                />
                <Button
                  onClick={() => void activateWithToken()}
                  disabled={isActivatingWithToken}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {isActivatingWithToken ? 'Activating With Token...' : 'Activate With Token'}
                </Button>
              </div>

              <Button variant="outline" className="w-full" onClick={() => onNavigate?.('profile')}>
                Open Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <Card className="rounded-2xl border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm text-slate-700">Active Plan</p>
                <p className="text-lg font-semibold text-emerald-900">{subscription.planName || subscription.planId}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1">
                  Daily limit: {subscription.dailyAiLimit}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1">
                  Used: {aiUsage?.usedToday ?? ((aiUsage?.chatCount || 0) + (aiUsage?.solverCount || 0))}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1">
                  Remaining: {aiUsage?.remainingToday ?? 0}
                </span>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1">
                  Tokens: {aiUsage?.tokenConsumed || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="chat" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 !bg-white/80 !border-indigo-100">
              <TabsTrigger value="chat">Ask Doubt</TabsTrigger>
              <TabsTrigger value="solver">Question Solver</TabsTrigger>
              <TabsTrigger value="planner">Study Planner</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
                <Card className="rounded-2xl border-indigo-100 bg-white/92">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                      <MessageSquare className="h-5 w-5 text-indigo-500" />
                      Chat with Study Assistant
                    </CardTitle>
                    <CardDescription>Premium chatbot with plan-based daily limits</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ScrollArea className="h-[320px] rounded-xl border border-indigo-100 bg-[#fafbff] p-3 pr-4 sm:h-[360px]">
                      <div className="space-y-4">
                        {chatMessages.map((msg, index) => (
                          <div
                            key={`${msg.role}-${index}`}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-xl px-4 py-3 text-sm ${
                                msg.role === 'user'
                                  ? 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-sm'
                                  : 'border border-indigo-100 bg-white text-slate-700'
                              }`}
                            >
                              <p>{msg.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Textarea
                        placeholder="Ask your question here... e.g., Explain integration by parts"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        className="min-h-[70px] rounded-xl border-indigo-100 bg-white/95"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void askQuestion();
                          }
                        }}
                      />
                      <Button
                        onClick={() => void askQuestion()}
                        disabled={isAskingAI}
                        className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:h-[70px] sm:w-14"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-indigo-100 bg-white/92">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl text-indigo-950">Popular Topics</CardTitle>
                    <CardDescription>One-tap prompts to start faster</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2.5">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setQuestion(prompt)}
                          className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="solver" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.4fr_1.6fr]">
                <Card className="rounded-2xl border-indigo-100 bg-white/92">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                      <FileQuestion className="h-5 w-5 text-indigo-500" />
                      OCR Question Solver
                    </CardTitle>
                    <CardDescription>Upload image or paste text to get custom structured solutions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-gradient-to-r from-[#f8f9ff] to-[#eef3ff] p-8 text-center">
                      <Upload className="mx-auto mb-3 h-11 w-11 text-indigo-400" />
                      <p className="mb-1 text-indigo-950">Upload a question image</p>
                      <p className="mb-4 text-sm text-slate-500">Supports JPG, PNG (Max 5MB)</p>
                      <Button variant="outline" onClick={handleChooseFile} className="rounded-xl border-indigo-200 bg-white">
                        Choose File
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        className="hidden"
                        onChange={(event) => void handleFileChange(event)}
                      />
                      {solverImageName ? <p className="mt-3 text-xs text-slate-500">Selected: {solverImageName}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="solver-manual-text">Question Text (optional or OCR fallback)</Label>
                      <Textarea
                        id="solver-manual-text"
                        value={solverQuestionText}
                        onChange={(e) => setSolverQuestionText(e.target.value)}
                        placeholder="Paste question text if image OCR is unclear"
                        className="min-h-[120px] border-indigo-100"
                      />
                    </div>

                    <Button onClick={() => void solveQuestion()} disabled={isSolving} className="w-full">
                      {isSolving ? 'Solving...' : 'Solve Question'}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-indigo-100 bg-white/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-2xl text-indigo-950">Guided Solution Output</CardTitle>
                    <CardDescription>Concept explanation, steps, final answer, and speed trick</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {solverResult ? (
                      <>
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-slate-600">
                          Detected: {solverResult.detected.subject} - {solverResult.detected.topic}
                        </div>

                        <InfoBlock icon={Brain} title="Concept Explanation" body={solverResult.result.conceptExplanation} />

                        <div className="rounded-xl border border-indigo-100 bg-white p-3">
                          <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-indigo-950">
                            <Sparkles className="h-4 w-4 text-indigo-400" />
                            Step-by-Step Solution
                          </p>
                          <ol className="space-y-1 text-sm text-slate-700">
                            {solverResult.result.stepByStepSolution.map((step, index) => (
                              <li key={`${step}-${index}`}>{index + 1}. {step}</li>
                            ))}
                          </ol>
                        </div>

                        <InfoBlock icon={CheckCircle2} title="Final Answer" body={solverResult.result.finalAnswer} />
                        <InfoBlock icon={Zap} title="Shortest Trick" body={solverResult.result.shortestTrick} />
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                        Solver output will appear here after you submit a question.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="planner" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
                <Card className="rounded-2xl border-indigo-100 bg-white/92">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                      <Calendar className="h-5 w-5 text-indigo-500" />
                      Smart Study Planner
                    </CardTitle>
                    <CardDescription>Generate and persist your personalized plan</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="planner-target-date">Target NET Date</Label>
                      <Input
                        id="planner-target-date"
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                        className="border-indigo-100"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="planner-daily-hours">Daily Study Hours</Label>
                      <Input
                        id="planner-daily-hours"
                        type="number"
                        min={1}
                        max={14}
                        value={dailyHours}
                        onChange={(e) => setDailyHours(e.target.value)}
                        className="border-indigo-100"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="prep-level">Current Preparation Level</Label>
                      <Select value={currentLevel} onValueChange={setCurrentLevel}>
                        <SelectTrigger id="prep-level" className="border-indigo-100">
                          <SelectValue placeholder="Select your level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner - Just started</SelectItem>
                          <SelectItem value="intermediate">Intermediate - 30-50% done</SelectItem>
                          <SelectItem value="advanced">Advanced - 60-80% done</SelectItem>
                          <SelectItem value="revision">Revision - Final preparation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="weak-subjects">Weak Subjects (comma separated)</Label>
                      <Input
                        id="weak-subjects"
                        value={weakSubjectsText}
                        onChange={(e) => setWeakSubjectsText(e.target.value)}
                        placeholder="mathematics, physics"
                        className="border-indigo-100"
                      />
                    </div>

                    <Button
                      onClick={() => void generateStudyPlan()}
                      disabled={isGeneratingPlan}
                      className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                    >
                      {isGeneratingPlan ? 'Generating...' : 'Generate Study Plan'}
                    </Button>
                  </CardContent>
                </Card>

                {planData ? (
                  <Card className="rounded-2xl border-indigo-100 bg-white/92">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-2xl text-indigo-950">Your Study Plan ({planData.daysLeft} Days Left)</CardTitle>
                      <CardDescription>Saved to your account and synced across sessions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {planData.weeklyTargets.map((item) => (
                        <PlanBlock
                          key={`${item.week}-${item.focus}`}
                          title={`Week ${item.week}: ${item.focus}`}
                          days={item.target}
                          lines={planData.roadmap}
                        />
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="rounded-2xl border-indigo-100 bg-gradient-to-r from-[#f4f6ff] to-[#eceffd]">
                    <CardContent className="flex h-full min-h-[290px] items-center justify-center text-center">
                      <div>
                        <Clock3 className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
                        <p className="text-indigo-950">Generate your study plan to see roadmap here.</p>
                        <p className="text-sm text-slate-500">Planner is persisted per account.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
}: {
  icon: typeof Brain;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-indigo-900">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Brain;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-3">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-indigo-950">
        <Icon className="h-4 w-4 text-indigo-400" />
        {title}
      </p>
      <p className="text-sm text-slate-700">{body}</p>
    </div>
  );
}

function PlanBlock({
  title,
  days,
  lines,
}: {
  title: string;
  days: string;
  lines: string[];
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-indigo-950">{title}</h4>
        <span className="text-xs text-slate-500">{days}</span>
      </div>
      <ul className="space-y-1 text-sm text-slate-600">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>- {line}</li>
        ))}
      </ul>
    </div>
  );
}
