import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { promises as fs } from 'fs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

type UploadResponse = { success: true; url: string } | { success: false; message: string };

function getExtFromMime(mime: string): string | null {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UploadResponse>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} tidak diizinkan.` });
  }

  try {
    const { dataUrl, kind } = req.body as { dataUrl?: string; kind?: 'avatar' | 'cover' };
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'dataUrl tidak diberikan.' });
    }
    if (kind !== 'avatar' && kind !== 'cover') {
      return res.status(400).json({ success: false, message: 'kind harus avatar atau cover.' });
    }

    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Format dataUrl tidak valid atau mime tidak didukung.' });
    }
    const mime = match[1];
    const base64 = match[2];
    const ext = getExtFromMime(mime);
    if (!ext) return res.status(400).json({ success: false, message: 'Tipe gambar tidak didukung.' });

    const buffer = Buffer.from(base64, 'base64');

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', kind);
    await fs.mkdir(uploadsDir, { recursive: true });
    const fileName = `${kind}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);

    const urlPath = `/uploads/${kind}/${fileName}`;
    return res.status(200).json({ success: true, url: urlPath });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || 'Gagal mengunggah file.' });
  }
}


