import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { promises as fs } from 'fs';

type AppConfig = {
  brandingName: string;
  brandingHandle: string;
  avatarUrl: string;
  coverUrl: string;
  targetGoal: number;
  feePercent: number; // e.g. 0.007 for 0.7%
  paymentTolerancePercent: number; // e.g. 0.02 for 2%
  paymentToleranceMin: number; // e.g. 100 rupiah
};

const DEFAULT_CONFIG: AppConfig = {
  brandingName: 'AutoFtBot69',
  brandingHandle: '@AutoFtBot69',
  avatarUrl: '/gambar.jpg',
  coverUrl: '/viaQris.jpg',
  targetGoal: 1000000,
  feePercent: 0.007,
  paymentTolerancePercent: 0.02,
  paymentToleranceMin: 100,
};

const dataFilePath = path.join(process.cwd(), 'public', 'data', 'viaQris.json');

async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(dataFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...(parsed || {}),
    } as AppConfig;
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

async function writeConfig(config: AppConfig): Promise<void> {
  const dir = path.dirname(dataFilePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  await fs.writeFile(dataFilePath, JSON.stringify(config, null, 2), 'utf-8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const cfg = await readConfig();
    return res.status(200).json(cfg);
  }

  if (req.method === 'POST') {
    try {
      const incoming = (req.body || {}) as Partial<AppConfig>;
      const current = await readConfig();
      const merged: AppConfig = {
        ...current,
        ...incoming,
        // normalize types
        targetGoal: Number(incoming.targetGoal ?? current.targetGoal),
        feePercent: Number(incoming.feePercent ?? current.feePercent),
        paymentTolerancePercent: Number(incoming.paymentTolerancePercent ?? current.paymentTolerancePercent),
        paymentToleranceMin: Number(incoming.paymentToleranceMin ?? current.paymentToleranceMin),
      };
      await writeConfig(merged);
      return res.status(200).json({ success: true, config: merged });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e?.message || 'Failed to save config' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} tidak diizinkan.` });
}


