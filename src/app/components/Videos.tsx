import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Play } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BusyButton } from './BusyButton';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { PremiumLockScreen } from './subscription/PremiumLockScreen';
import { PremiumCountdownBadge } from './subscription/PremiumCountdownBadge';
import {
  COMPUTER_SCIENCE_SYLLABUS,
  FLAT_TOPIC_TABS,
  INTELLIGENCE_SYLLABUS,
  SYLLABUS,
  type ChapterItem,
} from './Preparation';
import { buildSectionId, resolveSyllabusSection, slugifyKey, topicIdForChapter } from '../../../shared/syllabusCatalog.js';

type AcademicPart = 'part1' | 'part2';
type TabKey = SubjectKey;
type PartStructuredSubjectKey = 'mathematics' | 'physics' | 'english' | 'biology' | 'chemistry';

const PART_STRUCTURED_SUBJECTS: PartStructuredSubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'physics', label: 'Physics' },
  { key: 'english', label: 'English' },
  { key: 'biology', label: 'Biology' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'computer-science', label: 'Computer Science' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'quantitative-mathematics', label: 'Quantitative Mathematics' },
  { key: 'design-aptitude', label: 'Design Aptitude' },
];

const tabTriggerToneByKey: Record<TabKey, { active: string }> = {
  mathematics: { active: 'data-[state=active]:from-indigo-600 data-[state=active]:to-violet-500' },
  physics: { active: 'data-[state=active]:from-cyan-600 data-[state=active]:to-blue-500' },
  english: { active: 'data-[state=active]:from-rose-600 data-[state=active]:to-pink-500' },
  biology: { active: 'data-[state=active]:from-emerald-600 data-[state=active]:to-teal-500' },
  chemistry: { active: 'data-[state=active]:from-amber-500 data-[state=active]:to-orange-500' },
  'computer-science': { active: 'data-[state=active]:from-sky-600 data-[state=active]:to-indigo-500' },
  intelligence: { active: 'data-[state=active]:from-violet-600 data-[state=active]:to-fuchsia-500' },
  'quantitative-mathematics': { active: 'data-[state=active]:from-fuchsia-600 data-[state=active]:to-violet-500' },
  'design-aptitude': { active: 'data-[state=active]:from-purple-600 data-[state=active]:to-indigo-500' },
};

const PREPARATION_TAB_WIDTH_CLASS = 'max-w-[min(100%,11rem)] sm:max-w-[13rem] md:max-w-[15rem] lg:max-w-none';

type CatalogVideo = {
  id: string;
  title: string;
  description: string;
  duration: number;
  section: string;
  displayOrder: number;
  thumbnailUrl?: string;
  uploadedAt?: string | null;
  createdAt?: string;
};

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sectionIdFor(params: {
  subjectId: string;
  partId?: string;
  chapterId: string;
  topicId: string;
  sectionTitle: string;
}) {
  return buildSectionId({
    subjectId: params.subjectId,
    partId: params.partId || '',
    chapterId: params.chapterId,
    topicId: params.topicId,
    sectionTitle: params.sectionTitle,
  });
}

export function Videos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { surface, me, loading: subLoading } = useSubscription();
  const videosAccessAllowed = Boolean(
    me?.paidServices?.preparation?.allowed
    || (me?.preparationAccess?.allowed && me?.preparationAccess?.source !== 'legacy')
    || (surface?.allowed && (surface?.source === 'global' || surface?.source === 'manual')),
  );

  const [selectedSubject, setSelectedSubject] = useState<TabKey>('mathematics');
  const [selectedPartBySubject, setSelectedPartBySubject] = useState<Record<PartStructuredSubjectKey, AcademicPart | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, AcademicPart | null>)
  ));
  const [selectedChapterBySubject, setSelectedChapterBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));
  const [selectedSectionBySubject, setSelectedSectionBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));
  const [selectedComputerScienceChapterId, setSelectedComputerScienceChapterId] = useState<string | null>(null);
  const [selectedComputerScienceSection, setSelectedComputerScienceSection] = useState<string | null>(null);
  const [selectedIntelligenceChapterId, setSelectedIntelligenceChapterId] = useState<string | null>(null);
  const [selectedIntelligenceSection, setSelectedIntelligenceSection] = useState<string | null>(null);
  const [selectedFlatTopicByTab, setSelectedFlatTopicByTab] = useState<Record<'quantitative-mathematics' | 'design-aptitude', string | null>>({
    'quantitative-mathematics': null,
    'design-aptitude': null,
  });

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeSectionTitle, setActiveSectionTitle] = useState('');
  const [videos, setVideos] = useState<CatalogVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(Boolean(searchParams.get('sectionId')));
  const [videosError, setVideosError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(searchParams.get('videoId'));
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const videoPanelRef = useRef<HTMLDivElement | null>(null);
  const fetchedSectionRef = useRef<string | null>(null);

  const loadSectionVideos = useCallback(async (sectionId: string, sectionTitle: string) => {
    fetchedSectionRef.current = sectionId;
    setActiveSectionId(sectionId);
    setActiveSectionTitle(sectionTitle);
    setVideos([]);
    setVideosError('');
    setVideosLoading(true);
    setPlayingId(null);
    setPlaybackUrl('');
    setPlaybackError('');
    try {
      const payload = await apiRequest<{ videos: CatalogVideo[] }>(
        `/api/videos/sections?sectionId=${encodeURIComponent(sectionId)}`,
      );
      setVideos(Array.isArray(payload.videos) ? payload.videos : []);
    } catch {
      setVideosError('Unable to load videos.');
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const querySectionId = searchParams.get('sectionId');

  useEffect(() => {
    if (!querySectionId) return;
    const node = resolveSyllabusSection(querySectionId);
    if (!node?.subjectId) return;
    setSelectedSubject(node.subjectId as TabKey);
    if (PART_STRUCTURED_SUBJECTS.includes(node.subjectId as PartStructuredSubjectKey)) {
      const subject = node.subjectId as PartStructuredSubjectKey;
      const part = node.partId === 'part2' ? 'part2' : 'part1';
      setSelectedPartBySubject((prev) => ({ ...prev, [subject]: part }));
      setSelectedChapterBySubject((prev) => ({ ...prev, [subject]: node.chapterId }));
      setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: node.section }));
    } else if (node.subjectId === 'computer-science') {
      setSelectedComputerScienceChapterId(node.chapterId);
      setSelectedComputerScienceSection(node.section);
    } else if (node.subjectId === 'intelligence') {
      setSelectedIntelligenceChapterId(node.chapterId);
      setSelectedIntelligenceSection(node.section);
    } else if (node.subjectId === 'quantitative-mathematics' || node.subjectId === 'design-aptitude') {
      setSelectedFlatTopicByTab((prev) => ({ ...prev, [node.subjectId]: node.section }));
    }
  }, [querySectionId]);

  useEffect(() => {
    if (!querySectionId) return;
    if (fetchedSectionRef.current === querySectionId) return;
    const node = resolveSyllabusSection(querySectionId);
    void loadSectionVideos(querySectionId, node?.section || 'Section');
  }, [querySectionId, loadSectionVideos]);

  useEffect(() => {
    if (!activeSectionId) return;
    window.requestAnimationFrame(() => {
      videoPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [activeSectionId, videosLoading, videos.length, videosError]);

  const playVideo = async (videoId: string) => {
    setPlayingId(videoId);
    setPlaybackError('');
    setPlaybackLoading(true);
    setPlaybackUrl('');
    try {
      const payload = await apiRequest<{ playbackUrl: string }>(`/api/videos/${encodeURIComponent(videoId)}/play`);
      setPlaybackUrl(payload.playbackUrl || '');
      const next = new URLSearchParams(searchParams);
      if (activeSectionId) next.set('sectionId', activeSectionId);
      next.set('videoId', videoId);
      setSearchParams(next, { replace: true });
    } catch {
      setPlaybackError('Unable to prepare this video. Try again.');
    } finally {
      setPlaybackLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <h1>Videos</h1>
        <p className="text-muted-foreground">Sign in to browse syllabus lectures.</p>
      </div>
    );
  }

  if (subLoading) {
    return (
      <div className="space-y-4">
        <h1>Videos</h1>
        <p className="text-muted-foreground">Loading subscription…</p>
      </div>
    );
  }

  if (!videosAccessAllowed) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1>Videos</h1>
            <p className="text-muted-foreground">Lectures by subject, part, chapter, and section</p>
          </div>
          <PremiumCountdownBadge />
        </div>
        <PremiumLockScreen
          title="Unlock video lectures"
          description="Video lectures use the same preparation access as Preparation Materials. An active trial or premium subscription is required."
        />
      </div>
    );
  }

  const selectSection = (sectionId: string, sectionTitle: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('sectionId', sectionId);
    next.delete('videoId');
    setSearchParams(next, { replace: true });
    void loadSectionVideos(sectionId, sectionTitle);
  };

  const videoPanel = (
    <div ref={videoPanelRef} className="mt-2">
    <Card className="border-indigo-100 dark:border-indigo-500/40">
      <CardHeader>
        <CardTitle>{activeSectionTitle || 'Videos'}</CardTitle>
        <CardDescription>Published lectures for this section.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {videosLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading videos...
          </p>
        ) : null}
        {videosError ? (
          <div className="space-y-2">
            <p className="text-sm text-rose-700">Unable to load videos.</p>
            <BusyButton
              type="button"
              onClick={() => activeSectionId && void loadSectionVideos(activeSectionId, activeSectionTitle)}
            >
              Try again
            </BusyButton>
          </div>
        ) : null}
        {!videosLoading && !videosError && activeSectionId && videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-5">
            <p className="font-medium text-indigo-950">No videos available yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Video lessons for this section will appear here once published.
            </p>
          </div>
        ) : null}

        {playingId ? (
          <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-slate-950">
            {playbackLoading ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-indigo-100">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing video...
              </div>
            ) : playbackError ? (
              <div className="space-y-2 p-6 text-center text-sm text-rose-100">
                <p>{playbackError}</p>
                <BusyButton type="button" onClick={() => void playVideo(playingId)}>Try again</BusyButton>
              </div>
            ) : playbackUrl ? (
              <video
                key={playbackUrl}
                className="aspect-video w-full bg-black"
                controls
                playsInline
                preload="metadata"
                src={playbackUrl}
              />
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3">
          {videos.map((video, index) => (
            <button
              key={video.id}
              type="button"
              onClick={() => void playVideo(video.id)}
              className={`grid gap-3 rounded-2xl border p-3 text-left transition-all duration-200 active:scale-[0.99] sm:grid-cols-[160px_minmax(0,1fr)] ${playingId === video.id ? 'border-indigo-400 bg-indigo-50 shadow-[0_10px_18px_rgba(79,70,229,0.18)]' : 'border-indigo-100 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/50'}`}
            >
              <div className="relative overflow-hidden rounded-xl bg-slate-900">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="aspect-video h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-indigo-100">
                    <Play className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-500">
                  {String(video.displayOrder || index + 1).padStart(2, '0')} · {video.section}
                </p>
                <p className="mt-1 font-semibold text-indigo-950 dark:text-white">{video.title}</p>
                {video.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{video.description}</p> : null}
                <p className="mt-2 text-sm text-slate-500">{formatDuration(video.duration)}</p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
    </div>
  );

  const renderChapterTree = (
    subject: SubjectKey,
    chapters: ChapterItem[],
    partId: string,
    selectedChapterId: string | null,
    selectedSection: string | null,
    onChapter: (id: string) => void,
    onSection: (title: string) => void,
  ) => (
    <div className="space-y-3">
      {chapters.map((chapter) => {
        const active = selectedChapterId === chapter.id;
        return (
          <div key={chapter.id} className={`rounded-xl border ${active ? 'border-indigo-300 bg-indigo-50/70' : 'border-indigo-100 bg-white'}`}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left transition active:scale-[0.99]"
              onClick={() => onChapter(active ? '' : chapter.id)}
            >
              <span className="font-medium text-slate-800">{chapter.title}</span>
              <ChevronRight className={`h-4 w-4 transition ${active ? 'rotate-90 text-indigo-600' : 'text-slate-400'}`} />
            </button>
            {active ? (
              <div className="space-y-2 border-t border-indigo-100 p-3">
                <p className="px-1 text-xs font-medium uppercase tracking-[0.16em] text-indigo-500">Topic</p>
                <p className="px-1 pb-1 text-sm text-slate-600">{chapter.title}</p>
                {chapter.sections.map((sectionTitle) => {
                  const sectionId = sectionIdFor({
                    subjectId: subject,
                    partId,
                    chapterId: chapter.id,
                    topicId: topicIdForChapter(chapter.id),
                    sectionTitle,
                  });
                  const selected = selectedSection === sectionTitle || activeSectionId === sectionId;
                  return (
                    <div key={sectionTitle}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition active:scale-[0.99] ${selected ? 'border-transparent bg-gradient-to-r from-indigo-600 to-violet-500 text-white' : 'border-indigo-100 bg-white hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-900'}`}
                      onClick={() => {
                        onSection(sectionTitle);
                        selectSection(sectionId, sectionTitle);
                      }}
                    >
                      <span>{sectionTitle}</span>
                      <Play className="h-3.5 w-3.5 opacity-80" />
                    </button>
                    {selected ? videoPanel : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1>Videos</h1>
        <p className="text-muted-foreground">Same syllabus as Preparation Materials — browse lectures by section.</p>
      </div>

      <Tabs value={selectedSubject} onValueChange={(value) => setSelectedSubject(value as TabKey)}>
        <div className="net360-horizontal-scroll net360-swipe-row -mx-1 px-1 pb-1">
          <TabsList className="inline-flex h-auto min-w-max flex-nowrap gap-1.5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-[#eef2ff] via-[#f1ecff] to-[#f5f8ff] p-1.5 shadow-[0_8px_18px_rgba(79,70,229,0.14)] lg:min-w-0 lg:flex-wrap lg:justify-center">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                onClick={() => setSelectedSubject(tab.key)}
                className={`!flex-none min-h-[2.55rem] rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-1.5 text-center text-[12px] font-semibold leading-tight text-slate-700 whitespace-normal break-words transition-all duration-300 hover:-translate-y-0.5 data-[state=active]:-translate-y-0.5 data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!text-white sm:text-sm ${PREPARATION_TAB_WIDTH_CLASS} ${tabTriggerToneByKey[tab.key].active}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabItems.map((tab) => {
          if (tab.key === 'quantitative-mathematics' || tab.key === 'design-aptitude') {
            const flatKey = tab.key;
            const content = FLAT_TOPIC_TABS[flatKey];
            const selectedFlatTopic = selectedFlatTopicByTab[flatKey];
            const chapterId = `${flatKey}::topics`;
            return (
              <TabsContent key={flatKey} value={flatKey} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{content.title}</CardTitle>
                    <CardDescription>Topic list (no chapter structure for this section)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {content.topics.map((topic) => (
                        <li key={topic}>
                          <button
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-200 active:scale-[0.99] ${selectedFlatTopic === topic ? 'border-transparent bg-gradient-to-r from-indigo-600 to-violet-500 text-white' : 'border-indigo-100 bg-white hover:bg-indigo-50'}`}
                            onClick={() => {
                              setSelectedFlatTopicByTab((prev) => ({ ...prev, [flatKey]: topic }));
                              const topicId = `${chapterId}::${slugifyKey(topic)}`;
                              selectSection(sectionIdFor({
                                subjectId: flatKey,
                                chapterId,
                                topicId,
                                sectionTitle: topic,
                              }), topic);
                            }}
                          >
                            {topic}
                          </button>
                          {selectedFlatTopic === topic ? videoPanel : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          if (tab.key === 'computer-science' || tab.key === 'intelligence') {
            const subject = tab.key;
            const chapters = subject === 'computer-science' ? COMPUTER_SCIENCE_SYLLABUS : INTELLIGENCE_SYLLABUS;
            const selectedChapterId = subject === 'computer-science' ? selectedComputerScienceChapterId : selectedIntelligenceChapterId;
            const selectedSection = subject === 'computer-science' ? selectedComputerScienceSection : selectedIntelligenceSection;
            const setChapter = subject === 'computer-science' ? setSelectedComputerScienceChapterId : setSelectedIntelligenceChapterId;
            const setSection = subject === 'computer-science' ? setSelectedComputerScienceSection : setSelectedIntelligenceSection;
            return (
              <TabsContent key={subject} value={subject} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{getSubjectLabel(subject)} Syllabus</CardTitle>
                    <CardDescription>Chapter and section structure (no part split).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderChapterTree(subject, chapters, '', selectedChapterId, selectedSection, (id) => setChapter(id || null), setSection)}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          const subject = tab.key as PartStructuredSubjectKey;
          const selectedPart = selectedPartBySubject[subject];
          const selectedChapterId = selectedChapterBySubject[subject];
          const selectedSection = selectedSectionBySubject[subject];
          return (
            <TabsContent key={subject} value={subject} className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {(['part1', 'part2'] as AcademicPart[]).map((part) => (
                  <button
                    key={part}
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${selectedPart === part ? 'border-transparent bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_12px_24px_rgba(79,70,229,0.28)]' : 'border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100'}`}
                    onClick={() => {
                      if (selectedPart === part) return;
                      setSelectedPartBySubject((prev) => ({ ...prev, [subject]: part }));
                      setSelectedChapterBySubject((prev) => ({ ...prev, [subject]: null }));
                      setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: null }));
                    }}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] opacity-80">{part === 'part1' ? 'Part 1' : 'Part 2'}</p>
                    <p className="mt-1 font-semibold">{SYLLABUS[subject][part].label}</p>
                  </button>
                ))}
              </div>
              {selectedPart ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{getSubjectLabel(subject)} — {selectedPart === 'part1' ? 'Part 1' : 'Part 2'}</CardTitle>
                    <CardDescription>Chapters, topics, and sections from Preparation Materials.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderChapterTree(
                      subject,
                      SYLLABUS[subject][selectedPart].chapters,
                      selectedPart,
                      selectedChapterId,
                      selectedSection,
                      (id) => setSelectedChapterBySubject((prev) => ({ ...prev, [subject]: id || null })),
                      (title) => setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: title })),
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
