import type { NextApiRequest, NextApiResponse } from 'next';
import QRCode from 'qrcode';

const { 
    GITHUB_TOKEN, 
    REPO_OWNER, 
    REPO_NAME, 
    BRANCH, 
    JSON_FILE_PATH,
    DATA_STATIS_QRIS,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    MUTASI_ENDPOINT,
    MUTASI_AUTH_USERNAME,
    MUTASI_AUTH_TOKEN
} = process.env;

// Normalize env strings copied with quotes or inline comments
const normalizeEnv = (value?: string): string => {
  if (!value) return '';
  let out = value.trim();
  // Remove inline comments like: // comment here
  const commentIndex = out.indexOf('//');
  if (commentIndex !== -1) out = out.slice(0, commentIndex).trim();
  // Strip wrapping quotes/backticks if present
  out = out.replace(/^['"`]+/, '').replace(/['"`]+$/, '').trim();
  return out;
};

const OWNER = normalizeEnv(REPO_OWNER);
const REPO = normalizeEnv(REPO_NAME);
const BRANCH_NAME = normalizeEnv(BRANCH);
const FILE_PATH = normalizeEnv(JSON_FILE_PATH);
const TOKEN = normalizeEnv(GITHUB_TOKEN);
const TELE_BOT = normalizeEnv(TELEGRAM_BOT_TOKEN);
const TELE_CHAT = normalizeEnv(TELEGRAM_CHAT_ID);
const DEFAULT_MUTASI_URL = 'https://orkut.ftvpn.me/api/mutasi';
const MUTASI_URL_RAW = normalizeEnv(MUTASI_ENDPOINT);
const MUTASI_URL = /^https?:\/\/.+/.test(MUTASI_URL_RAW) ? MUTASI_URL_RAW : DEFAULT_MUTASI_URL;
const MUTASI_USER = normalizeEnv(MUTASI_AUTH_USERNAME);
const MUTASI_TOKEN = normalizeEnv(MUTASI_AUTH_TOKEN);
const QRIS_BASE = normalizeEnv(DATA_STATIS_QRIS);

interface EntriData {
  penjual: string;
  jenis: "produk" | "jasa";
  tanggal: string;
  nama: string;
  email: string;
  pesan: string;
  nama_transaksi: string;
  harga_transaksi: string;
  metode_pembayaran_transaksi: string;
  status_pembayaran_transaksi: string;
  url_pambayaran: string;
  kedaluwarsa: string;
}

interface SemuaData {
  [kunci: string]: EntriData;
}

const hitungCRC16 = (input: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ('0000' + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
};

const buatStringQris = (nominal: number): string => {
  if (!QRIS_BASE) throw new Error('Data QRIS statis tidak ditemukan.');
  if (!QRIS_BASE.includes('5802ID')) throw new Error('Format QRIS statis tidak valid (tag 58 negara tidak ditemukan).');
  // pastikan dynamic QR (010212)
  const qrisTanpaCRC = QRIS_BASE.slice(0, -4).replace('010211', '010212');
  const posNegara = qrisTanpaCRC.indexOf('5802ID');
  const nilai = Math.floor(Math.max(0, nominal));
  const nominalStr = String(nilai);
  const tag54 = `54${nominalStr.length.toString().padStart(2, '0')}${nominalStr}`;
  const qrisDenganNominal = qrisTanpaCRC.slice(0, posNegara) + tag54 + qrisTanpaCRC.slice(posNegara);
  return qrisDenganNominal + hitungCRC16(qrisDenganNominal);
};

const dapatkanUrlApiGitHub = (path: string = FILE_PATH) =>
  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH_NAME}`;

const headerUmum = {
  Authorization: `token ${TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
};

// Minimal diagnostic logger to help trace env and target URL in production logs
const logDebugEnv = (context: string, extra?: Record<string, unknown>) => {
  try {
    // Do not log token value; only whether it exists
    console.error(`[viaQris/api/v2] ${context}`, {
      owner: OWNER,
      repo: REPO,
      branch: BRANCH_NAME,
      path: FILE_PATH,
      hasToken: !!TOKEN,
      hasTelegram: !!(TELE_BOT && TELE_CHAT),
      ...(extra || {})
    });
  } catch {}
};

function escapeHtml(input?: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTelegramMessage(kunciEntri: string, entri: EntriData): string {
  const nominal = parseInt((entri.harga_transaksi || '').replace(/[^0-9]/g, ''), 10) || 0;
  const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(nominal);
  const waktu = new Date().toLocaleString('id-ID');
  const pesanBlock = entri.pesan ? `\n<b>Pesan</b>:\n<blockquote>${escapeHtml(entri.pesan)}</blockquote>` : '';
  return (
    `<b>🎉 DUKUNGAN BERHASIL</b>\n` +
    `───────────────\n` +
    `<b>ID</b>: <code>${escapeHtml(kunciEntri)}</code>\n` +
    `<b>Nama</b>: ${escapeHtml(entri.nama || '-') }\n` +
    `<b>Jumlah</b>: ${escapeHtml(rupiah)}\n` +
    `<b>Metode</b>: ${escapeHtml(entri.metode_pembayaran_transaksi || 'QRIS')}\n` +
    pesanBlock + `\n` +
    `<b>Waktu</b>: ${escapeHtml(waktu)}`
  );
}

async function kirimNotifikasiTelegram(pesan: string, isHtml: boolean = false): Promise<void> {
  if (!TELE_BOT || !TELE_CHAT) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELE_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELE_CHAT, text: pesan, parse_mode: isHtml ? 'HTML' : undefined, disable_web_page_preview: true })
    });
    if (!response.ok) {
      const text = await response.text();
      logDebugEnv('Telegram notify error', { status: response.status, error: text });
    }
  } catch (e: any) {
    logDebugEnv('Telegram notify exception', { error: e?.message });
  }
}

async function ambilMutasiTerbaru(): Promise<any[] | null> {
  if (!MUTASI_URL || !MUTASI_USER || !MUTASI_TOKEN) return null;
  try {
    const resp = await fetch(MUTASI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_username: MUTASI_USER, auth_token: MUTASI_TOKEN })
    });
    if (!resp.ok) {
      const text = await resp.text();
      logDebugEnv('Mutasi fetch error', { status: resp.status, url: MUTASI_URL, error: text });
      return null;
    }
    const data = await resp.json();
    if (data && data.status && Array.isArray(data.data)) return data.data;
    return null;
  } catch (e: any) {
    logDebugEnv('Mutasi fetch exception', { url: MUTASI_URL, error: e?.message });
    return null;
  }
}

async function perbaruiKontenGitHub(
  dataUntukDiperbarui: SemuaData,
  shaFileSaatIni: string | undefined,
  pesanKomit: string
): Promise<{ success: boolean; error?: any; commitUrl?: string }> {
    const kontenBaruEncode = Buffer.from(JSON.stringify(dataUntukDiperbarui, null, 2)).toString('base64');
    const payload: { message: string; content: string; branch: string; sha?: string } = {
        message: pesanKomit,
        content: kontenBaruEncode,
        branch: BRANCH_NAME,
    };
    if (shaFileSaatIni) {
        payload.sha = shaFileSaatIni;
    }
    try {
        const urlTarget = dapatkanUrlApiGitHub();
        const respons = await fetch(urlTarget, { method: 'PUT', headers: { ...headerUmum, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!respons.ok) { 
            const dataError = await respons.json(); 
            logDebugEnv('PUT error', { status: respons.status, url: urlTarget, error: dataError });
            return { success: false, error: dataError.message }; 
        }
        const hasil = await respons.json();
        return { success: true, commitUrl: hasil.commit.html_url };
    } catch (error: any) { 
        logDebugEnv('PUT exception', { error: error?.message });
        return { success: false, error: error.message }; 
    }
}

export default async function penangan(permintaan: NextApiRequest, jawaban: NextApiResponse) {
  jawaban.setHeader('Access-Control-Allow-Origin', '*');
  jawaban.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  jawaban.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (permintaan.method === 'OPTIONS') return jawaban.status(200).end();
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME || !JSON_FILE_PATH || !BRANCH || !DATA_STATIS_QRIS) {
    return jawaban.status(500).json({ message: 'Konfigurasi server tidak lengkap.' });
  }

  if (permintaan.method === 'GET') {
    try {
        const urlGet = dapatkanUrlApiGitHub();
        const responsFile = await fetch(urlGet, { method: 'GET', headers: headerUmum });
        if (responsFile.status === 404) { logDebugEnv('GET 404', { url: urlGet }); return jawaban.status(200).json({}); }
        if (!responsFile.ok) { const dataError = await responsFile.json(); logDebugEnv('GET error', { status: responsFile.status, url: urlGet, error: dataError }); return jawaban.status(responsFile.status).json({ message: 'Gagal mengambil data dari GitHub.', error: dataError.message }); }
        const infoFile = await responsFile.json();
        const kontenDekode = Buffer.from(infoFile.content, 'base64').toString('utf-8');
        return jawaban.status(200).json(JSON.parse(kontenDekode));
    } catch (error: any) { return jawaban.status(500).json({ message: 'Kesalahan server saat mengambil data (GET).', error: error.message }); }
  }

  if (permintaan.method === 'POST') {
    try {
      const { aksi, kunciEntri, dataBaru, statusBaru } = permintaan.body;
      
      const urlGet = dapatkanUrlApiGitHub();
      const responsFile = await fetch(urlGet, { method: 'GET', headers: headerUmum });
      let dataSaatIni: SemuaData = {};
      let shaFile: string | undefined = undefined;

      if (responsFile.status === 404) { /* File baru */ logDebugEnv('POST pre-read 404', { url: urlGet }); } 
      else if (!responsFile.ok) { const dataError = await responsFile.json(); logDebugEnv('POST pre-read error', { status: responsFile.status, url: urlGet, error: dataError }); return jawaban.status(responsFile.status).json({ message: 'Gagal mengambil data eksisting (POST).', error: dataError.message }); }
      else {
        const infoFile = await responsFile.json();
        const kontenDekode = Buffer.from(infoFile.content, 'base64').toString('utf-8');
        dataSaatIni = JSON.parse(kontenDekode);
        shaFile = infoFile.sha;
      }

      if (aksi === 'updateStatus') {
        if (!kunciEntri || !statusBaru) return jawaban.status(400).json({ message: 'kunciEntri dan statusBaru diperlukan.' });
        if (!dataSaatIni[kunciEntri]) return jawaban.status(404).json({ message: `Entri '${kunciEntri}' tidak ditemukan.` });
        
        const statusValid = ['Berhasil', 'Di Proses', 'Dibatalkan'];
        if (!statusValid.includes(statusBaru)) return jawaban.status(400).json({ message: 'Nilai status tidak valid.' });

        dataSaatIni[kunciEntri].status_pembayaran_transaksi = statusBaru;
        const pesanKomit = `Update status to '${statusBaru}' for ${kunciEntri}.`;
        const hasilUpdate = await perbaruiKontenGitHub(dataSaatIni, shaFile, pesanKomit);

        if (!hasilUpdate.success) return jawaban.status(500).json({ message: 'Gagal update status ke GitHub.', error: hasilUpdate.error });
        if (statusBaru === 'Berhasil') {
          const entri = dataSaatIni[kunciEntri];
          await kirimNotifikasiTelegram(buildTelegramMessage(kunciEntri, entri), true);
        }
        return jawaban.status(200).json({ message: `Status untuk '${kunciEntri}' berhasil diubah.`, updatedData: dataSaatIni[kunciEntri] });
      
      } else if (aksi === 'cekPembayaran') {
        if (!kunciEntri) return jawaban.status(400).json({ message: 'kunciEntri diperlukan.' });
        if (!dataSaatIni[kunciEntri]) return jawaban.status(404).json({ message: `Entri '${kunciEntri}' tidak ditemukan.` });

        const entri = dataSaatIni[kunciEntri];
        const nominal = parseInt((entri.harga_transaksi || '').replace(/[^0-9]/g, ''), 10) || 0;
        const mutasi = await ambilMutasiTerbaru();
        if (!mutasi) return jawaban.status(502).json({ message: 'Gagal mengambil data mutasi.' });

        // Beberapa API mutasi menyetor amount bersih (setelah fee). Izinkan toleransi +/- 2% atau 100 rupiah
        const toleransi = Math.max(100, Math.floor(nominal * 0.02));
        const cocok = (angka: number) => Math.abs(angka - nominal) <= toleransi;
        const ditemukan = mutasi.some((m: any) => {
          const tipe = String(m.type || '').toUpperCase();
          if (tipe !== 'CR') return false;
          const amt = parseInt(String(m.amount).replace(/[^0-9]/g,'') || '0', 10);
          return cocok(amt);
        });
        if (!ditemukan) return jawaban.status(200).json({ message: 'Belum ditemukan pembayaran masuk.', match: false });

        dataSaatIni[kunciEntri].status_pembayaran_transaksi = 'Berhasil';
        const hasilUpdate = await perbaruiKontenGitHub(dataSaatIni, shaFile, `Auto mark paid for ${kunciEntri}.`);
        if (!hasilUpdate.success) return jawaban.status(500).json({ message: 'Gagal update status ke GitHub.', error: hasilUpdate.error });

        await kirimNotifikasiTelegram(buildTelegramMessage(kunciEntri, entri), true);
        return jawaban.status(200).json({ message: 'Pembayaran terdeteksi. Status ditandai Berhasil.', match: true });

      } else {
        if (!kunciEntri || typeof dataBaru !== 'object' || dataBaru === null) return jawaban.status(400).json({ message: 'kunciEntri dan dataBaru diperlukan.' });
        
        const dataDiproses = { ...dataBaru } as EntriData;
        const nominalAngka = parseInt(dataDiproses.harga_transaksi.replace(/[^0-9]/g, ''), 10) || 0;
        
        const stringQris = buatStringQris(nominalAngka);
        // Gunakan quiet zone >= 4 modul dan resolusi lebih tinggi agar mudah discan
        const dataUrlQris = await QRCode.toDataURL(stringQris, { errorCorrectionLevel: 'H', margin: 4, width: 512, scale: 8 });
        dataDiproses.url_pambayaran = dataUrlQris;
        
        const semuaDataDiperbarui = { ...dataSaatIni, [kunciEntri]: dataDiproses };
        const pesanKomit = `Create data.json: ${kunciEntri}.`;
        const hasilUpdate = await perbaruiKontenGitHub(semuaDataDiperbarui, shaFile, pesanKomit);

        if (!hasilUpdate.success) return jawaban.status(500).json({ message: 'Gagal menyimpan data ke GitHub.', error: hasilUpdate.error });
        return jawaban.status(200).json({ message: `Data untuk '${kunciEntri}' berhasil diproses!`, url_pambayaran: dataDiproses.url_pambayaran });
      }
    } catch (error: any) {
      return jawaban.status(500).json({ message: 'Kesalahan server (POST).', error: error.message });
    }
  }
  jawaban.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return jawaban.status(405).json({ error: `Method ${permintaan.method} tidak diizinkan.` });
}
