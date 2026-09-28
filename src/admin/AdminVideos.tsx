import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Film, Loader2, Play, Upload } from 'lucide-react';
import { apiRequest } from '../app/lib/api';
import { publicHierarchyPayload, resolveSyllabusSection } from '../../shared/syllabusCatalog.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Textarea } from '../app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Badge } from '../app/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../app/components/ui/alert-dialog';
import { BusyButton } from '../app/components/BusyButton';
import { showErrorToast, showSuccessToast, handleApiError } from '../app/lib/userToast';

type AdminPanel = 'library' | 'upload' | 'import' | 'manage';
type VideoStatus = 'draft' | 'published' | 'disabled';

type AdminVideo = {
  id: string;
  title: string;
  description: string;
  subject: string;
  chapter: string;
  section: string;
  sectionId: string;
  duration: number;
  status: VideoStatus;
  uploadedAt?: string | null;
  createdAt?: string;
  r2ObjectKey: string;
  thumbnailObjectKey?: string;
  displayOrder: number;
  mimeType: string;
  fileSize: number;
};

type HierarchySubject = ReturnType<typeof publicHierarchyPayload>[number];

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function readVideoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const value = Number(el.duration || 0);
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(value) ? value : 0);
    };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

async function putToSignedUrl(url: string, file: File, contentType: string) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    throw new Error('Direct upload to storage failed.');
  }
}

export function AdminVideos() {
  const hierarchy = useMemo(() => publicHierarchyPayload(), []);
  const [panel, setPanel] = useState<AdminPanel>('library');
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterPart, setFilterPart] = useState('all');
  const [filterChapter, setFilterChapter] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [playUrl, setPlayUrl] = useState('');
  const [playTitle, setPlayTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminVideo | null>(null);
  const [deleteObjectToo, setDeleteObjectToo] = useState(false);

  const [subjectId, setSubjectId] = useState(hierarchy[0]?.subjectId || 'mathematics');
  const subjectNode = hierarchy.find((item) => item.subjectId === subjectId) || hierarchy[0];
  const parts = subjectNode?.parts || [];
  const [partId, setPartId] = useState(parts[0]?.partId || '');
  const chapters = (parts.find((item) => item.partId === partId) || parts[0])?.chapters || [];
  const [chapterId, setChapterId] = useState(chapters[0]?.chapterId || '');
  const sections = (chapters.find((item) => item.chapterId === chapterId) || chapters[0])?.sections || [];
  const [sectionId, setSectionId] = useState(sections[0]?.sectionId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [status, setStatus] = useState<VideoStatus>('draft');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [r2Prefix, setR2Prefix] = useState('');
  const [r2Objects, setR2Objects] = useState<Array<{ key: string; size: number; linked: boolean }>>([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [selectedR2Key, setSelectedR2Key] = useState('');
  const [editVideo, setEditVideo] = useState<AdminVideo | null>(null);

  useEffect(() => {
    const nextParts = subjectNode?.parts || [];
    const nextPart = nextParts.some((item) => item.partId === partId) ? partId : (nextParts[0]?.partId || '');
    setPartId(nextPart);
  }, [subjectId, subjectNode, partId]);

  useEffect(() => {
    const nextChapters = (parts.find((item) => item.partId === partId) || parts[0])?.chapters || [];
    const nextChapter = nextChapters.some((item) => item.chapterId === chapterId) ? chapterId : (nextChapters[0]?.chapterId || '');
    setChapterId(nextChapter);
  }, [partId, parts, chapterId]);

  useEffect(() => {
    const nextSections = (chapters.find((item) => item.chapterId === chapterId) || chapters[0])?.sections || [];
    const nextSection = nextSections.some((item) => item.sectionId === sectionId) ? sectionId : (nextSections[0]?.sectionId || '');
    setSectionId(nextSection);
  }, [chapterId, chapters, sectionId]);

  const syllabusSelectors = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {hierarchy.map((item: HierarchySubject) => (
              <SelectItem key={item.subjectId} value={item.subjectId}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Part</Label>
        <Select value={partId || 'none'} onValueChange={(value) => setPartId(value === 'none' ? '' : value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {parts.map((item) => (
              <SelectItem key={item.partId || 'none'} value={item.partId || 'none'}>{item.label || 'General'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Chapter</Label>
        <Select value={chapterId} onValueChange={setChapterId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {chapters.map((item) => (
              <SelectItem key={item.chapterId} value={item.chapterId}>{item.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Topic</Label>
        <Input readOnly value={chapters.find((item) => item.chapterId === chapterId)?.topic || ''} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label>Section</Label>
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sections.map((item) => (
              <SelectItem key={item.sectionId} value={item.sectionId}>{item.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        subjectId: filterSubject === 'all' ? '' : filterSubject,
        partId: filterPart === 'all' ? '' : filterPart,
        chapterId: filterChapter,
        sectionId: filterSection,
        status: filterStatus,
        pageSize: '50',
      });
      const payload = await apiRequest<{ videos: AdminVideo[]; total: number }>(`/api/admin/videos?${params.toString()}`);
      setVideos(payload.videos || []);
      setTotal(payload.total || 0);
    } catch (error) {
      handleApiError(error, 'Unable to load the video library.');
    } finally {
      setLoading(false);
    }
  }, [search, filterSubject, filterPart, filterChapter, filterSection, filterStatus]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const uploadVideo = async () => {
    if (!videoFile || !title.trim() || !sectionId) {
      showErrorToast('Select a section, enter a title, and choose a video file.');
      return;
    }
    setUploading(true);
    try {
      const duration = await readVideoDuration(videoFile);
      const start = await apiRequest<{
        video: AdminVideo;
        upload: { url: string; headers: Record<string, string> };
        thumbnailUpload?: { url: string; headers: Record<string, string> } | null;
      }>('/api/admin/videos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId,
          title: title.trim(),
          description,
          displayOrder: Number(displayOrder) || 1,
          mimeType: videoFile.type || 'video/mp4',
          fileSize: videoFile.size,
          duration,
          thumbnailMimeType: thumbFile?.type || '',
        }),
      });
      await putToSignedUrl(start.upload.url, videoFile, videoFile.type || 'video/mp4');
      if (thumbFile && start.thumbnailUpload?.url) {
        await putToSignedUrl(start.thumbnailUpload.url, thumbFile, thumbFile.type);
      }
      await apiRequest(`/api/admin/videos/${start.video.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      if (status === 'published') {
        await apiRequest(`/api/admin/videos/${start.video.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        });
      }
      showSuccessToast('Video uploaded. Metadata saved as draft until you publish.');
      setTitle('');
      setDescription('');
      setVideoFile(null);
      setThumbFile(null);
      setPanel('library');
      void loadLibrary();
    } catch (error) {
      handleApiError(error, 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const loadR2 = async () => {
    setR2Loading(true);
    try {
      const payload = await apiRequest<{ objects: Array<{ key: string; size: number; linked: boolean }> }>(
        `/api/admin/videos/r2-objects?prefix=${encodeURIComponent(r2Prefix)}`,
      );
      setR2Objects(payload.objects || []);
    } catch (error) {
      handleApiError(error, 'Unable to browse R2 objects.');
    } finally {
      setR2Loading(false);
    }
  };

  const importR2 = async () => {
    if (!selectedR2Key || !sectionId) {
      showErrorToast('Select an R2 object and a syllabus section.');
      return;
    }
    setUploading(true);
    try {
      await apiRequest('/api/admin/videos/import-r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          r2ObjectKey: selectedR2Key,
          sectionId,
          title: title.trim() || selectedR2Key.split('/').pop(),
          description,
          displayOrder: Number(displayOrder) || 1,
          status,
        }),
      });
      showSuccessToast('Existing R2 video imported into the library.');
      setPanel('library');
      void loadLibrary();
    } catch (error) {
      handleApiError(error, 'Import failed.');
    } finally {
      setUploading(false);
    }
  };

  const play = async (video: AdminVideo) => {
    setBusyId(video.id);
    try {
      const payload = await apiRequest<{ playbackUrl: string }>(`/api/admin/videos/${video.id}/play`);
      setPlayUrl(payload.playbackUrl);
      setPlayTitle(video.title);
    } catch (error) {
      handleApiError(error, 'Unable to play video.');
    } finally {
      setBusyId('');
    }
  };

  const patchStatus = async (video: AdminVideo, next: VideoStatus) => {
    setBusyId(video.id);
    try {
      await apiRequest(`/api/admin/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      showSuccessToast(next === 'published' ? 'Video published.' : `Video set to ${next}.`);
      void loadLibrary();
    } catch (error) {
      handleApiError(error, 'Unable to update status.');
    } finally {
      setBusyId('');
    }
  };

  const saveEdit = async () => {
    if (!editVideo) return;
    setBusyId(editVideo.id);
    try {
      await apiRequest(`/api/admin/videos/${editVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editVideo.title,
          description: editVideo.description,
          displayOrder: editVideo.displayOrder,
          status: editVideo.status,
          sectionId,
          moveObject: true,
        }),
      });
      showSuccessToast('Video updated.');
      setEditVideo(null);
      void loadLibrary();
    } catch (error) {
      handleApiError(error, 'Unable to save video.');
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await apiRequest(`/api/admin/videos/${deleteTarget.id}?deleteObject=${deleteObjectToo ? 'true' : 'false'}`, {
        method: 'DELETE',
      });
      showSuccessToast(deleteObjectToo ? 'Metadata and R2 object deleted.' : 'Metadata deleted. R2 object kept.');
      setDeleteTarget(null);
      void loadLibrary();
    } catch (error) {
      handleApiError(error, 'Delete failed.');
    } finally {
      setBusyId('');
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      showSuccessToast('Object key copied.');
    } catch {
      showErrorToast('Could not copy object key.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        {([
          ['library', 'Video Library'],
          ['upload', 'Upload Video'],
          ['import', 'Import Existing R2 Video'],
          ['manage', 'Manage Videos'],
        ] as Array<[AdminPanel, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition active:scale-[0.99] ${panel === id ? 'border-cyan-400 bg-cyan-100/70 text-cyan-950' : 'border-slate-300 bg-white/70 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {playUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>{playTitle}</CardTitle>
            <CardDescription>Admin playback uses a short-lived signed URL.</CardDescription>
          </CardHeader>
          <CardContent>
            <video className="aspect-video w-full rounded-xl bg-black" controls src={playUrl} />
          </CardContent>
        </Card>
      ) : null}

      {panel === 'upload' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />Upload Video</CardTitle>
            <CardDescription>Select the existing Preparation Materials syllabus, then upload directly to R2.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {syllabusSelectors}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Video title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Real Numbers — Lecture 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Display order</Label>
                <Input value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Video file</Label>
                <Input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Thumbnail (optional)</Label>
                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setThumbFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Publish status after upload</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as VideoStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <BusyButton type="button" busy={uploading} busyLabel="Uploading..." onClick={() => void uploadVideo()}>
              Upload to R2
            </BusyButton>
          </CardContent>
        </Card>
      ) : null}

      {panel === 'import' ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Existing R2 Video</CardTitle>
            <CardDescription>Browse objects already in net-360-videos, then assign a syllabus section.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {syllabusSelectors}
            <div className="flex flex-wrap gap-2">
              <Input value={r2Prefix} onChange={(e) => setR2Prefix(e.target.value)} placeholder="Mathematics/Part-1/" />
              <BusyButton type="button" busy={r2Loading} busyLabel="Loading objects..." onClick={() => void loadR2()}>
                Browse R2
              </BusyButton>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
              {r2Objects.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedR2Key(item.key)}
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition ${selectedR2Key === item.key ? 'bg-cyan-100' : 'hover:bg-slate-50'}`}
                >
                  {item.key} {item.linked ? <Badge className="ml-2">linked</Badge> : null}
                </button>
              ))}
              {!r2Objects.length ? <p className="p-2 text-sm text-muted-foreground">Browse R2 to list objects.</p> : null}
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title override" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            <Select value={status} onValueChange={(value) => setStatus(value as VideoStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <BusyButton type="button" busy={uploading} busyLabel="Importing..." onClick={() => void importR2()}>
              Save metadata
            </BusyButton>
          </CardContent>
        </Card>
      ) : null}

      {panel === 'library' || panel === 'manage' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Film className="h-4 w-4" />Video Library</CardTitle>
            <CardDescription>{total} videos in the database. Files stay in Cloudflare R2.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search videos..." />
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {hierarchy.map((item: HierarchySubject) => (
                    <SelectItem key={item.subjectId} value={item.subjectId}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPart} onValueChange={setFilterPart}>
                <SelectTrigger><SelectValue placeholder="Part" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All parts</SelectItem>
                  <SelectItem value="part1">Part 1</SelectItem>
                  <SelectItem value="part2">Part 2</SelectItem>
                </SelectContent>
              </Select>
              <Input value={filterChapter} onChange={(e) => setFilterChapter(e.target.value)} placeholder="Chapter id" />
              <Input value={filterSection} onChange={(e) => setFilterSection(e.target.value)} placeholder="Section id" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading videos...</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Video</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Chapter</th>
                    <th className="py-2 pr-3">Section</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Uploaded</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((video) => (
                    <tr key={video.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium">{video.title}</td>
                      <td className="py-2 pr-3">{video.subject}</td>
                      <td className="py-2 pr-3">{video.chapter}</td>
                      <td className="py-2 pr-3">{video.section}</td>
                      <td className="py-2 pr-3">{formatDuration(video.duration)}</td>
                      <td className="py-2 pr-3"><Badge>{video.status}</Badge></td>
                      <td className="py-2 pr-3">{video.uploadedAt ? new Date(video.uploadedAt).toLocaleDateString() : '—'}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" disabled={busyId === video.id} onClick={() => void play(video)}><Play className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditVideo(video); setSectionId(video.sectionId); setPanel('manage'); }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => void copyKey(video.r2ObjectKey)}><Copy className="h-3.5 w-3.5" /></Button>
                          {video.status !== 'published' ? (
                            <Button size="sm" onClick={() => void patchStatus(video, 'published')}>Publish</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void patchStatus(video, 'disabled')}>Disable</Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => { setDeleteTarget(video); setDeleteObjectToo(false); }}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {panel === 'manage' && editVideo ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit / move video</CardTitle>
            <CardDescription>{resolveSyllabusSection(editVideo.sectionId)?.section || editVideo.section}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {syllabusSelectors}
            <Input value={editVideo.title} onChange={(e) => setEditVideo({ ...editVideo, title: e.target.value })} />
            <Textarea value={editVideo.description} onChange={(e) => setEditVideo({ ...editVideo, description: e.target.value })} />
            <Select value={editVideo.status} onValueChange={(value) => setEditVideo({ ...editVideo, status: value as VideoStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <BusyButton type="button" busy={busyId === editVideo.id} onClick={() => void saveEdit()}>Save changes</BusyButton>
            <div className="space-y-1.5">
              <Label>Replace video file</Label>
              <Input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !editVideo) return;
                  void (async () => {
                    setBusyId(editVideo.id);
                    try {
                      const start = await apiRequest<{ upload: { url: string; objectKey: string } }>(`/api/admin/videos/${editVideo.id}/replace`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mimeType: file.type || 'video/mp4' }),
                      });
                      await putToSignedUrl(start.upload.url, file, file.type || 'video/mp4');
                      const duration = await readVideoDuration(file);
                      await apiRequest(`/api/admin/videos/${editVideo.id}/replace/complete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ r2ObjectKey: start.upload.objectKey, duration, deletePreviousObject: true }),
                      });
                      showSuccessToast('Video file replaced.');
                      void loadLibrary();
                    } catch (error) {
                      handleApiError(error, 'Replace failed.');
                    } finally {
                      setBusyId('');
                    }
                  })();
                }}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete video?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteObjectToo
                ? 'This permanently deletes the database metadata AND the Cloudflare R2 object. This cannot be undone.'
                : 'This deletes database metadata only. The file in Cloudflare R2 will be kept.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deleteObjectToo} onChange={(e) => setDeleteObjectToo(e.target.checked)} />
            Also delete the R2 object
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              {deleteObjectToo ? 'Delete metadata + R2 object' : 'Delete metadata only'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
