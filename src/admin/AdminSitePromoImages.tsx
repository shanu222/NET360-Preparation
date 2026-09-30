import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
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
import { handleApiError, showErrorToast, showSuccessToast } from '../app/lib/userToast';
import { uploadWithProgress } from './directR2Upload';

type PromoSlot = 'loginBanner' | 'featuredAd';

interface PromoSlotState {
  slot: PromoSlot;
  label: string;
  active: boolean;
  previewUrl: string;
  contentType: string;
  fileSize: number;
  updatedAt: string | null;
  updatedByEmail: string;
}

const DEFAULT_PREVIEW: Record<PromoSlot, string> = {
  loginBanner: '/images/login-banner.png',
  featuredAd: '/images/app-promo.png',
};

const ACCEPTED = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminSitePromoImages() {
  const [slots, setSlots] = useState<PromoSlotState[]>([]);
  const [r2Configured, setR2Configured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<PromoSlot | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PromoSlotState | null>(null);
  const fileInputs = useRef<Partial<Record<PromoSlot, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<{ r2Configured: boolean; slots: PromoSlotState[] }>('/api/admin/site-promo-images');
      setSlots(payload.slots || []);
      setR2Configured(Boolean(payload.r2Configured));
    } catch (error) {
      handleApiError(error, 'Could not load website promo images.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (slot: PromoSlotState, file: File) => {
    if (!ACCEPTED.split(',').includes(file.type)) {
      showErrorToast('Upload a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      showErrorToast('Image must be smaller than 10 MB.');
      return;
    }
    setBusySlot(slot.slot);
    setUploadPercent(0);
    try {
      const start = await apiRequest<{ upload: { url: string; headers?: Record<string, string>; objectKey: string } }>(
        `/api/admin/site-promo-images/${slot.slot}/upload-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type, fileSize: file.size }),
        },
      );
      await uploadWithProgress(start.upload.url, file, start.upload.headers || { 'Content-Type': file.type }, setUploadPercent);
      await apiRequest(`/api/admin/site-promo-images/${slot.slot}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey: start.upload.objectKey }),
      });
      showSuccessToast(`${slot.label} ${slot.active ? 'replaced' : 'uploaded'}. The website now shows the new image.`);
      await load();
    } catch (error) {
      handleApiError(error, 'Could not upload the image.');
    } finally {
      setBusySlot(null);
      setUploadPercent(0);
      const input = fileInputs.current[slot.slot];
      if (input) input.value = '';
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setBusySlot(target.slot);
    try {
      await apiRequest(`/api/admin/site-promo-images/${target.slot}`, { method: 'DELETE' });
      showSuccessToast(`${target.label} deleted. The website shows the default image again.`);
      await load();
    } catch (error) {
      handleApiError(error, 'Could not delete the image.');
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Website Promo Images</CardTitle>
            <CardDescription>
              Manage the two promotional images on the website login page. Images are stored in Cloudflare R2. Deleting an image restores the default.
            </CardDescription>
          </div>
          <BusyButton type="button" variant="outline" busy={loading} busyLabel="Refreshing..." onClick={() => void load()}>
            Refresh
          </BusyButton>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!r2Configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Cloudflare R2 is not configured on the server, so uploads are unavailable.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {slots.map((slot) => {
            const busy = busySlot === slot.slot;
            return (
              <div key={slot.slot} className="space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{slot.label}</p>
                  <Badge variant={slot.active ? 'default' : 'secondary'}>{slot.active ? 'Custom image' : 'Default image'}</Badge>
                </div>
                <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <img
                    src={slot.active && slot.previewUrl ? slot.previewUrl : DEFAULT_PREVIEW[slot.slot]}
                    alt={`${slot.label} preview`}
                    className="max-h-72 w-auto max-w-full rounded-md object-contain"
                  />
                </div>
                {slot.active ? (
                  <p className="text-xs text-slate-500">
                    {[formatBytes(slot.fileSize), slot.updatedAt ? `Updated ${new Date(slot.updatedAt).toLocaleString()}` : '', slot.updatedByEmail ? `by ${slot.updatedByEmail}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                <input
                  ref={(node) => {
                    fileInputs.current[slot.slot] = node;
                  }}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(slot, file);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <BusyButton
                    type="button"
                    busy={busy}
                    busyLabel={uploadPercent > 0 ? `Uploading ${uploadPercent}%` : 'Working...'}
                    disabled={!r2Configured || (busySlot !== null && !busy)}
                    onClick={() => fileInputs.current[slot.slot]?.click()}
                  >
                    {slot.active ? <ImageIcon className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                    {slot.active ? 'Replace image' : 'Upload image'}
                  </BusyButton>
                  {slot.active ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      disabled={busySlot !== null}
                      onClick={() => setDeleteTarget(slot)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The image is removed from Cloudflare R2 and the website goes back to the default image.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
