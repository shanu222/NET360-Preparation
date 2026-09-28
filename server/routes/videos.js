import express from 'express';
import mongoose from 'mongoose';
import { VideoModel } from '../models/Video.js';
import { UserNotificationModel } from '../models/UserNotification.js';
import {
  buildR2Prefix,
  buildThumbnailObjectKey,
  buildVideoObjectKey,
  listSyllabusChapters,
  listSyllabusParts,
  listSyllabusSections,
  listSyllabusSubjects,
  publicHierarchyPayload,
  resolveSyllabusSection,
  slugifyKey,
} from '../../shared/syllabusCatalog.js';
import {
  abortMultipartUpload,
  assertR2Ready,
  completeMultipartUpload,
  copyObject,
  deleteObject,
  headObject,
  listObjects,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  objectMetadataFromVideo,
  presignGet,
  presignMultipartPart,
  presignPut,
  r2Config,
  startMultipartUpload,
} from '../lib/r2.js';
import { notifyVideoPublished } from '../lib/videoPublishNotify.js';

const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_VIDEO_BYTES = Number(process.env.R2_MAX_VIDEO_BYTES || 2 * 1024 * 1024 * 1024);
const PLAY_URL_TTL = Number(process.env.R2_PLAY_URL_TTL_SEC || 180);

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function sanitizeText(value, max = 300) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function parseStatus(value, fallback = 'draft') {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'unpublished' || status === 'disabled') return status === 'disabled' ? 'unpublished' : 'unpublished';
  if (status === 'draft' || status === 'published') return status;
  return fallback;
}

function extFromMime(mimeType, fallback = 'mp4') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return fallback;
}

function serializeVideo(doc, extras = {}) {
  const video = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(video._id),
    subject: video.subject,
    subjectId: video.subjectId,
    part: video.part,
    partId: video.partId,
    chapter: video.chapter,
    chapterId: video.chapterId,
    topic: video.topic,
    topicId: video.topicId,
    section: video.section,
    sectionId: video.sectionId,
    title: video.title,
    description: video.description || '',
    r2Bucket: video.r2Bucket,
    r2ObjectKey: video.r2ObjectKey,
    thumbnailObjectKey: video.thumbnailObjectKey || '',
    duration: Number(video.duration || 0),
    fileSize: Number(video.fileSize || 0),
    mimeType: video.mimeType || 'video/mp4',
    displayOrder: Number(video.displayOrder || 1),
    status: video.status,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    uploadedAt: video.uploadedAt,
    publishedAt: video.publishedAt,
    ...extras,
  };
}

function publicVideo(doc, extras = {}) {
  const full = serializeVideo(doc, extras);
  delete full.r2Bucket;
  delete full.r2ObjectKey;
  delete full.thumbnailObjectKey;
  return full;
}

function applySyllabusNode(target, node) {
  target.subject = node.subject;
  target.subjectId = node.subjectId;
  target.part = node.part || '';
  target.partId = node.partId || '';
  target.chapter = node.chapter || '';
  target.chapterId = node.chapterId || '';
  target.topic = node.topic || '';
  target.topicId = node.topicId || '';
  target.section = node.section;
  target.sectionId = node.sectionId;
}

async function maybeNotifyPublish(previousStatus, video) {
  if (video.status !== 'published') return;
  if (previousStatus === 'published') return;
  if (video.publishedNotifySentAt) return;
  video.publishedAt = video.publishedAt || new Date();
  video.publishedNotifySentAt = new Date();
  await video.save();
  setImmediate(() => {
    void notifyVideoPublished(video).catch((error) => {
      console.warn('[videos] notify failed:', error?.message || error);
    });
  });
}

async function signedThumb(video) {
  if (!video.thumbnailObjectKey) return '';
  try {
    const signed = await presignGet({
      key: video.thumbnailObjectKey,
      expiresIn: 300,
      contentType: 'image/jpeg',
    });
    return signed.url;
  } catch {
    return '';
  }
}

export function createVideosRouter({ authMiddleware, requireAdmin, studentPremiumSurface }) {
  const router = express.Router();

  router.get('/videos/subjects', ...studentPremiumSurface, (_req, res) => {
    res.json({ subjects: listSyllabusSubjects() });
  });

  router.get('/videos', ...studentPremiumSurface, (_req, res) => {
    res.json({ subjects: publicHierarchyPayload() });
  });

  router.get('/videos/hierarchy', ...studentPremiumSurface, (req, res) => {
    const subjectId = sanitizeText(req.query.subject || req.query.subjectId, 80).toLowerCase();
    const partId = sanitizeText(req.query.part || req.query.partId, 20).toLowerCase();
    const chapterId = sanitizeText(req.query.chapterId, 80);
    if (!subjectId) {
      res.json({ subjects: listSyllabusSubjects() });
      return;
    }
    if (!chapterId) {
      res.json({
        subjectId,
        parts: listSyllabusParts(subjectId),
        chapters: listSyllabusChapters(subjectId, partId),
      });
      return;
    }
    res.json({
      subjectId,
      partId,
      chapterId,
      sections: listSyllabusSections(subjectId, partId, chapterId),
    });
  });

  router.get('/videos/sections/:sectionId', ...studentPremiumSurface, async (req, res) => {
    try {
      const sectionId = decodeURIComponent(String(req.params.sectionId || ''));
      const node = resolveSyllabusSection(sectionId);
      if (!node) {
        res.status(404).json({ error: 'Section not found in the syllabus.' });
        return;
      }
      const videos = await VideoModel.find({
        sectionId,
        status: 'published',
        $or: [{ uploadComplete: true }, { uploadedAt: { $ne: null } }],
      })
        .sort({ displayOrder: 1, createdAt: 1 })
        .lean();
      const items = [];
      for (const video of videos) {
        items.push(publicVideo(video, { thumbnailUrl: await signedThumb(video) }));
      }
      res.json({
        section: node,
        videos: items,
      });
    } catch (error) {
      res.status(500).json({ error: 'Unable to load videos.' });
    }
  });

  router.get('/videos/:id/play', ...studentPremiumSurface, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id).lean();
      if (!video || video.status !== 'published' || (!video.uploadComplete && !video.uploadedAt)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const signed = await presignGet({
        key: video.r2ObjectKey,
        expiresIn: PLAY_URL_TTL,
        contentType: video.mimeType || 'video/mp4',
        filename: `${slugifyKey(video.title)}.${extFromMime(video.mimeType)}`,
      });
      res.json({
        video: publicVideo(video, { thumbnailUrl: await signedThumb(video) }),
        playbackUrl: signed.url,
        expiresIn: signed.expiresIn,
      });
    } catch (error) {
      res.status(500).json({ error: 'Unable to prepare video playback.' });
    }
  });

  router.get('/videos/:id', ...studentPremiumSurface, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id).lean();
      if (!video || video.status !== 'published' || (!video.uploadComplete && !video.uploadedAt)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      res.json({ video: publicVideo(video, { thumbnailUrl: await signedThumb(video) }) });
    } catch (error) {
      res.status(500).json({ error: 'Unable to load video.' });
    }
  });

  router.get('/notifications', authMiddleware, async (req, res) => {
    const items = await UserNotificationModel.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    res.json({
      notifications: items.map((item) => ({
        id: String(item._id),
        kind: item.kind,
        title: item.title,
        body: item.body,
        link: item.link,
        videoId: item.videoId,
        sectionId: item.sectionId,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
    });
  });

  router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
    if (!isObjectId(req.params.id)) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    const item = await UserNotificationModel.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    item.readAt = item.readAt || new Date();
    await item.save();
    res.json({ ok: true });
  });

  router.get('/admin/videos/syllabus', authMiddleware, requireAdmin, (_req, res) => {
    res.json({ subjects: publicHierarchyPayload() });
  });

  router.get('/admin/videos', authMiddleware, requireAdmin, async (req, res) => {
    const query = {};
    const q = sanitizeText(req.query.q || req.query.search, 120);
    const subjectId = sanitizeText(req.query.subjectId || req.query.subject, 80).toLowerCase();
    const partId = sanitizeText(req.query.partId || req.query.part, 20).toLowerCase();
    const chapterId = sanitizeText(req.query.chapterId, 80);
    const sectionId = sanitizeText(req.query.sectionId, 200);
    const status = sanitizeText(req.query.status, 20).toLowerCase();
    if (subjectId) query.subjectId = subjectId;
    if (partId) query.partId = partId;
    if (chapterId) query.chapterId = chapterId;
    if (sectionId) query.sectionId = sectionId;
    if (status && status !== 'all') query.status = parseStatus(status, status);
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { section: { $regex: q, $options: 'i' } },
        { chapter: { $regex: q, $options: 'i' } },
        { r2ObjectKey: { $regex: q, $options: 'i' } },
      ];
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const [items, total] = await Promise.all([
      VideoModel.find(query).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      VideoModel.countDocuments(query),
    ]);
    res.json({
      videos: items.map((item) => serializeVideo(item)),
      total,
      page,
      pageSize,
    });
  });

  router.get('/admin/videos/r2-objects', authMiddleware, requireAdmin, async (req, res) => {
    try {
      assertR2Ready();
      const listed = await listObjects({
        prefix: sanitizeText(req.query.prefix, 400),
        continuationToken: sanitizeText(req.query.cursor, 800),
        maxKeys: Number(req.query.limit) || 50,
      });
      const keys = listed.objects.map((item) => item.key);
      const linked = await VideoModel.find({ r2ObjectKey: { $in: keys } }).select('r2ObjectKey').lean();
      const linkedSet = new Set(linked.map((item) => item.r2ObjectKey));
      res.json({
        objects: listed.objects.map((item) => ({
          ...item,
          linked: linkedSet.has(item.key),
          isThumbnail: /\/thumbnails\//i.test(item.key),
        })),
        nextToken: listed.nextToken,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to list R2 objects.' });
    }
  });

  const startAdminVideoUpload = async (req, res) => {
    try {
      const cfg = assertR2Ready();
      const sectionId = sanitizeText(req.body?.sectionId, 240);
      const node = resolveSyllabusSection(sectionId);
      if (!node) {
        res.status(400).json({ error: 'Select a valid syllabus section.' });
        return;
      }
      const title = sanitizeText(req.body?.title, 180);
      if (!title) {
        res.status(400).json({ error: 'Video title is required.' });
        return;
      }
      const mimeType = sanitizeText(req.body?.mimeType, 80).toLowerCase() || 'video/mp4';
      if (!VIDEO_MIME.has(mimeType)) {
        res.status(400).json({ error: 'Unsupported video type. Use MP4, WebM, or MOV.' });
        return;
      }
      const fileSize = Number(req.body?.fileSize || 0);
      if (fileSize > MAX_VIDEO_BYTES) {
        res.status(400).json({ error: 'Video file is too large.' });
        return;
      }
      const displayOrder = Math.max(1, Number(req.body?.displayOrder) || 1);
      const description = sanitizeText(req.body?.description, 2000);
      const duration = Math.max(0, Number(req.body?.duration) || 0);
      const thumbnailMimeType = sanitizeText(req.body?.thumbnailMimeType, 80).toLowerCase();
      const requestedStatus = parseStatus(req.body?.status, 'draft');
      const videoId = new mongoose.Types.ObjectId();
      const r2ObjectKey = buildVideoObjectKey(node, {
        videoId,
        ext: extFromMime(mimeType),
      });
      const metadata = objectMetadataFromVideo({
        ...node,
        videoId: String(videoId),
        mimeType,
        title,
      });
      const video = await VideoModel.create({
        _id: videoId,
        ...node,
        title,
        description,
        r2Bucket: cfg.bucket,
        r2ObjectKey,
        thumbnailObjectKey: '',
        duration,
        fileSize,
        mimeType,
        displayOrder,
        status: 'draft',
        uploadComplete: false,
        createdByUserId: String(req.user._id),
        createdByEmail: req.user.email || '',
      });
      const useMultipart = fileSize >= MULTIPART_THRESHOLD;
      let upload = null;
      let multipart = null;
      if (useMultipart) {
        const started = await startMultipartUpload({
          key: r2ObjectKey,
          contentType: mimeType,
          metadata,
        });
        video.uploadSessionId = started.uploadId;
        await video.save();
        const partCount = Math.max(1, Math.ceil(Math.max(fileSize, 1) / MULTIPART_PART_SIZE));
        multipart = {
          uploadId: started.uploadId,
          objectKey: r2ObjectKey,
          partSize: MULTIPART_PART_SIZE,
          partCount,
        };
      } else {
        upload = await presignPut({
          key: r2ObjectKey,
          contentType: mimeType,
          metadata,
        });
      }
      let thumbnailUpload = null;
      if (IMAGE_MIME.has(thumbnailMimeType)) {
        const thumbKey = buildThumbnailObjectKey(r2ObjectKey, String(videoId));
        video.thumbnailObjectKey = thumbKey;
        await video.save();
        thumbnailUpload = await presignPut({
          key: thumbKey,
          contentType: thumbnailMimeType,
          metadata,
        });
      }
      res.json({
        video: serializeVideo(video),
        intendedStatus: requestedStatus === 'published' ? 'published' : requestedStatus,
        upload: upload
          ? {
            url: upload.url,
            method: 'PUT',
            headers: upload.headers,
            objectKey: r2ObjectKey,
            expiresIn: upload.expiresIn,
          }
          : null,
        multipart,
        thumbnailUpload: thumbnailUpload
          ? {
            url: thumbnailUpload.url,
            method: 'PUT',
            headers: thumbnailUpload.headers,
            objectKey: video.thumbnailObjectKey,
            expiresIn: thumbnailUpload.expiresIn,
          }
          : null,
      });
    } catch (error) {
      if (error?.code === 11000) {
        res.status(409).json({ error: 'That upload collided with an existing record. Retry to generate a new object key.' });
        return;
      }
      res.status(500).json({ error: error.message || 'Unable to start upload.' });
    }
  };

  router.post('/admin/videos/upload', authMiddleware, requireAdmin, startAdminVideoUpload);
  router.post('/admin/videos/upload-url', authMiddleware, requireAdmin, startAdminVideoUpload);
  router.post('/admin/videos', authMiddleware, requireAdmin, startAdminVideoUpload);

  router.post('/admin/videos/:id/upload-part-url', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const uploadId = sanitizeText(req.body?.uploadId || video.uploadSessionId, 500);
      const partNumber = Number(req.body?.partNumber);
      if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
        res.status(400).json({ error: 'A valid multipart part number is required.' });
        return;
      }
      const signed = await presignMultipartPart({
        key: video.r2ObjectKey,
        uploadId,
        partNumber,
      });
      res.json({ url: signed.url, partNumber: signed.partNumber, expiresIn: signed.expiresIn });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to authorize this upload part.' });
    }
  });

  router.post('/admin/videos/:id/complete-multipart', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const uploadId = sanitizeText(req.body?.uploadId || video.uploadSessionId, 500);
      if (!uploadId) {
        res.status(400).json({ error: 'Multipart upload id is missing.' });
        return;
      }
      await completeMultipartUpload({
        key: video.r2ObjectKey,
        uploadId,
        parts: Array.isArray(req.body?.parts) ? req.body.parts : [],
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to finish multipart upload.' });
    }
  });

  router.post('/admin/videos/:id/abort-upload', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      if (video.uploadSessionId) {
        await abortMultipartUpload({ key: video.r2ObjectKey, uploadId: video.uploadSessionId }).catch(() => undefined);
      }
      if (!video.uploadComplete && !video.uploadedAt) {
        if (video.r2ObjectKey) await deleteObject(video.r2ObjectKey).catch(() => undefined);
        if (video.thumbnailObjectKey) await deleteObject(video.thumbnailObjectKey).catch(() => undefined);
        await video.deleteOne();
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to cancel upload.' });
    }
  });

  router.post('/admin/videos/:id/complete', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const head = await headObject(video.r2ObjectKey);
      if (!head.exists) {
        res.status(400).json({ error: 'Video file was not found in R2. Finish the upload, then try again.' });
        return;
      }
      video.fileSize = head.contentLength || video.fileSize;
      video.mimeType = head.contentType || video.mimeType;
      video.uploadedAt = new Date();
      video.uploadComplete = true;
      video.uploadSessionId = '';
      if (Number(req.body?.duration) > 0) video.duration = Number(req.body.duration);
      const nextStatus = parseStatus(req.body?.status, video.status || 'draft');
      if (nextStatus === 'published' || nextStatus === 'unpublished' || nextStatus === 'draft') {
        const previousStatus = video.status;
        video.status = nextStatus;
        if (nextStatus === 'published') {
          await video.save();
          await maybeNotifyPublish(previousStatus, video);
        }
      }
      if (video.thumbnailObjectKey) {
        const thumb = await headObject(video.thumbnailObjectKey);
        if (!thumb.exists) video.thumbnailObjectKey = '';
      }
      await video.save();
      res.json({ video: serializeVideo(video) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to complete upload.' });
    }
  });

  router.post('/admin/videos/import-r2', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const cfg = assertR2Ready();
      const sectionId = sanitizeText(req.body?.sectionId, 240);
      const node = resolveSyllabusSection(sectionId);
      if (!node) {
        res.status(400).json({ error: 'Select a valid syllabus section.' });
        return;
      }
      const r2ObjectKey = sanitizeText(req.body?.r2ObjectKey, 500);
      if (!r2ObjectKey) {
        res.status(400).json({ error: 'R2 object key is required.' });
        return;
      }
      const existing = await VideoModel.findOne({ r2ObjectKey });
      if (existing) {
        res.status(409).json({ error: 'This R2 object is already linked in the video library.', video: serializeVideo(existing) });
        return;
      }
      const head = await headObject(r2ObjectKey);
      if (!head.exists) {
        res.status(404).json({ error: 'That object was not found in Cloudflare R2.' });
        return;
      }
      const title = sanitizeText(req.body?.title, 180) || r2ObjectKey.split('/').pop() || 'Imported video';
      const video = await VideoModel.create({
        ...node,
        title,
        description: sanitizeText(req.body?.description, 2000),
        r2Bucket: cfg.bucket,
        r2ObjectKey,
        thumbnailObjectKey: sanitizeText(req.body?.thumbnailObjectKey, 500),
        duration: Math.max(0, Number(req.body?.duration) || 0),
        fileSize: head.contentLength || 0,
        mimeType: head.contentType || sanitizeText(req.body?.mimeType, 80) || 'video/mp4',
        displayOrder: Math.max(1, Number(req.body?.displayOrder) || 1),
        status: parseStatus(req.body?.status, 'draft'),
        uploadComplete: true,
        uploadedAt: head.lastModified || new Date(),
        createdByUserId: String(req.user._id),
        createdByEmail: req.user.email || '',
      });
      await maybeNotifyPublish('', video);
      res.json({ video: serializeVideo(video) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to import R2 video.' });
    }
  });

  router.get('/admin/videos/:id/play', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id).lean();
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const signed = await presignGet({
        key: video.r2ObjectKey,
        expiresIn: PLAY_URL_TTL,
        contentType: video.mimeType || 'video/mp4',
      });
      res.json({
        video: serializeVideo(video, { thumbnailUrl: await signedThumb(video) }),
        playbackUrl: signed.url,
        expiresIn: signed.expiresIn,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to play video.' });
    }
  });

  router.patch('/admin/videos/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const previousStatus = video.status;
      if (req.body?.sectionId) {
        const node = resolveSyllabusSection(sanitizeText(req.body.sectionId, 240));
        if (!node) {
          res.status(400).json({ error: 'Select a valid syllabus section.' });
          return;
        }
        if (req.body?.moveObject === true && node.sectionId !== video.sectionId) {
          const nextKey = buildVideoObjectKey(node, {
            videoId: String(video._id),
            ext: extFromMime(video.mimeType),
          });
          await copyObject(video.r2ObjectKey, nextKey, objectMetadataFromVideo({
            ...node,
            videoId: String(video._id),
            mimeType: video.mimeType,
            title: sanitizeText(req.body?.title, 180) || video.title,
          }));
          const oldKey = video.r2ObjectKey;
          video.r2ObjectKey = nextKey;
          if (req.body?.deleteSourceObject === true) {
            await deleteObject(oldKey);
          }
        }
        applySyllabusNode(video, node);
      }
      if (typeof req.body?.title === 'string') video.title = sanitizeText(req.body.title, 180) || video.title;
      if (typeof req.body?.description === 'string') video.description = sanitizeText(req.body.description, 2000);
      if (req.body?.displayOrder != null) video.displayOrder = Math.max(1, Number(req.body.displayOrder) || 1);
      if (req.body?.duration != null) video.duration = Math.max(0, Number(req.body.duration) || 0);
      if (typeof req.body?.status === 'string') {
        const nextStatus = parseStatus(req.body.status, video.status);
        if (nextStatus === 'published' && !video.uploadComplete && !video.uploadedAt) {
          res.status(400).json({ error: 'Finish uploading the file before publishing.' });
          return;
        }
        video.status = nextStatus;
      }
      if (typeof req.body?.thumbnailObjectKey === 'string') {
        video.thumbnailObjectKey = sanitizeText(req.body.thumbnailObjectKey, 500);
      }
      await video.save();
      await maybeNotifyPublish(previousStatus, video);
      res.json({ video: serializeVideo(video) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to update video.' });
    }
  });

  router.post('/admin/videos/:id/replace', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!isObjectId(req.params.id)) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const mimeType = sanitizeText(req.body?.mimeType, 80).toLowerCase() || 'video/mp4';
      if (!VIDEO_MIME.has(mimeType)) {
        res.status(400).json({ error: 'Unsupported video type.' });
        return;
      }
      const node = resolveSyllabusSection(video.sectionId);
      const nextKey = buildVideoObjectKey(node || {
        subjectId: video.subjectId,
        partId: video.partId,
        chapterId: video.chapterId,
        chapter: video.chapter,
        section: video.section,
      }, {
        videoId: `${video._id}-r${Date.now()}`,
        ext: extFromMime(mimeType),
      });
      const upload = await presignPut({ key: nextKey, contentType: mimeType });
      await VideoModel.updateOne({ _id: video._id }, { $set: { uploadSessionId: nextKey } });
      res.json({
        upload: {
          url: upload.url,
          method: 'PUT',
          headers: upload.headers,
          objectKey: nextKey,
          expiresIn: upload.expiresIn,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to start replace upload.' });
    }
  });

  router.post('/admin/videos/:id/replace/complete', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const nextKey = sanitizeText(req.body?.r2ObjectKey || video.uploadSessionId, 500);
      if (!nextKey) {
        res.status(400).json({ error: 'Replacement object key is missing.' });
        return;
      }
      const head = await headObject(nextKey);
      if (!head.exists) {
        res.status(400).json({ error: 'Replacement file was not found in R2.' });
        return;
      }
      const oldKey = video.r2ObjectKey;
      video.r2ObjectKey = nextKey;
      video.fileSize = head.contentLength || 0;
      video.mimeType = head.contentType || video.mimeType;
      video.uploadedAt = new Date();
      video.uploadSessionId = '';
      if (Number(req.body?.duration) > 0) video.duration = Number(req.body.duration);
      await video.save();
      if (req.body?.deletePreviousObject === true && oldKey && oldKey !== nextKey) {
        await deleteObject(oldKey);
      }
      res.json({ video: serializeVideo(video) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to complete replace.' });
    }
  });

  router.delete('/admin/videos/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const video = await VideoModel.findById(req.params.id);
      if (!video) {
        res.status(404).json({ error: 'Video not found.' });
        return;
      }
      const deleteObjectToo = String(req.query.deleteObject || req.body?.deleteObject || '') === 'true';
      const objectKey = video.r2ObjectKey;
      const thumbKey = video.thumbnailObjectKey;
      await video.deleteOne();
      if (deleteObjectToo) {
        if (objectKey) await deleteObject(objectKey);
        if (thumbKey) await deleteObject(thumbKey).catch(() => undefined);
      }
      res.json({
        ok: true,
        deletedMetadata: true,
        deletedObject: deleteObjectToo,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Unable to delete video.' });
    }
  });

  return router;
}

export { r2Config };
