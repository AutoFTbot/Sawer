import type { NextPage } from 'next';
import Head from 'next/head';
import React, { useState, useEffect, FC } from 'react';
import Link from 'next/link';

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

const formatMataUang = (jumlah: string): string => {
    const angka = Number(jumlah.replace(/[^0-9]/g, ''));
    if (isNaN(angka)) return "Rp 0";
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
}

const HalamanDasbor: NextPage = () => {
  const [transaksi, aturTransaksi] = useState<SemuaData | null>(null);
  const [sedangMemuat, aturSedangMemuat] = useState(true);
  const [kesalahan, aturKesalahan] = useState<string | null>(null);
  const [modalDetailTerbuka, aturModalDetailTerbuka] = useState(false);
  const [transaksiTerpilih, aturTransaksiTerpilih] = useState<(EntriData & { id: string }) | null>(null);
  const [konfigurasi, aturKonfigurasi] = useState<{ brandingName: string; brandingHandle: string; avatarUrl: string; coverUrl: string; targetGoal: number; feePercent: number; paymentTolerancePercent: number; paymentToleranceMin: number } | null>(null);
  const [sedangSimpanKonfig, aturSedangSimpanKonfig] = useState(false);
  const [kataKunci, aturKataKunci] = useState('');
  const [filterStatus, aturFilterStatus] = useState<'SEMUA' | 'BERHASIL' | 'PROSES' | 'BELUM' | 'BATAL'>('SEMUA');

  const ambilData = async () => {
    aturSedangMemuat(true);
    try {
      const respons = await fetch('/api/v2');
      if (!respons.ok) {
        throw new Error(`Gagal memuat data: Status ${respons.status}`);
      }
      const data: SemuaData = await respons.json();
      aturTransaksi(data);
    } catch (err) {
      aturKesalahan((err as Error).message);
    } finally {
      aturSedangMemuat(false);
    }
  };

  useEffect(() => {
    ambilData();
    (async () => {
      try {
        const r = await fetch('/api/config');
        if (r.ok) {
          const cfg = await r.json();
          aturKonfigurasi(cfg);
        }
      } catch {}
    })();
  }, []);

  const tanganiBukaDetail = (id: string, data: EntriData) => {
    aturTransaksiTerpilih({ ...data, id });
    aturModalDetailTerbuka(true);
  };

  const tanganiUbahStatus = async (statusBaru: 'Berhasil' | 'Di Proses' | 'Dibatalkan') => {
    if (!transaksiTerpilih) return;
    
    const idTransaksi = transaksiTerpilih.id;
    const dataLama = { ...transaksi };

    aturTransaksi(prevData => {
        if (!prevData) return null;
        const dataBaru = { ...prevData };
        dataBaru[idTransaksi].status_pembayaran_transaksi = statusBaru;
        return dataBaru;
    });
    aturModalDetailTerbuka(false);

    try {
        const respons = await fetch('/api/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aksi: 'updateStatus', kunciEntri: idTransaksi, statusBaru: statusBaru })
        });
        const hasil = await respons.json();
        if (!respons.ok) throw new Error(hasil.message);
    } catch (error) {
        alert(`Gagal mengubah status: ${(error as Error).message}`);
        aturTransaksi(dataLama);
    }
  };

  const dapatkanKelasStatus = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('proses')) return 'status proses';
    if (s.includes('belum')) return 'status belum-bayar';
    if (s.includes('berhasil') || s.includes('sudah')) return 'status berhasil';
    if (s.includes('batal')) return 'status dibatalkan';
    return 'status';
  }

  const SimpanKonfigurasi = async () => {
    if (!konfigurasi) return;
    aturSedangSimpanKonfig(true);
    try {
      const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(konfigurasi) });
      const h = await r.json();
      if (!r.ok || !h.success) throw new Error(h.message || 'Gagal menyimpan konfigurasi');
      alert('Konfigurasi tersimpan');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      aturSedangSimpanKonfig(false);
    }
  };

  const hitungRingkasan = () => {
    const data = transaksi || {};
    let total = 0, berhasil = 0, proses = 0, belum = 0, batal = 0;
    Object.values(data).forEach((t) => {
      total += 1;
      const s = (t.status_pembayaran_transaksi || '').toLowerCase();
      if (s.includes('berhasil') || s.includes('sudah')) berhasil += 1;
      else if (s.includes('proses')) proses += 1;
      else if (s.includes('batal')) batal += 1;
      else belum += 1;
    });
    return { total, berhasil, proses, belum, batal };
  };

  const dataTerfilter = (): [string, EntriData][] => {
    if (!transaksi) return [];
    const entries = Object.entries(transaksi);
    const filteredBySearch = kataKunci.trim().length === 0 ? entries : entries.filter(([id, data]) => {
      const q = kataKunci.toLowerCase();
      return (
        id.toLowerCase().includes(q) ||
        (data.nama || '').toLowerCase().includes(q) ||
        (data.email || '').toLowerCase().includes(q)
      );
    });
    const filteredByStatus = filteredBySearch.filter(([_, data]) => {
      if (filterStatus === 'SEMUA') return true;
      const s = (data.status_pembayaran_transaksi || '').toLowerCase();
      if (filterStatus === 'BERHASIL') return s.includes('berhasil') || s.includes('sudah');
      if (filterStatus === 'PROSES') return s.includes('proses');
      if (filterStatus === 'BELUM') return s.includes('belum');
      if (filterStatus === 'BATAL') return s.includes('batal');
      return true;
    });
    return filteredByStatus.sort(([,a], [,b]) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  };

  const Toolbar = () => (
    <div className="toolbar">
      <input className="input-formulir" placeholder="Cari ID, nama, atau email" value={kataKunci} onChange={e => aturKataKunci(e.target.value)} />
      <select className="select" value={filterStatus} onChange={e => aturFilterStatus(e.target.value as any)}>
        <option value="SEMUA">Semua Status</option>
        <option value="BERHASIL">Berhasil</option>
        <option value="PROSES">Di Proses</option>
        <option value="BELUM">Belum Bayar</option>
        <option value="BATAL">Dibatalkan</option>
      </select>
    </div>
  );

  const KartuStatistik = () => {
    const s = hitungRingkasan();
    return (
      <div className="stat-cards">
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{s.total}</div></div>
        <div className="stat-card success"><div className="stat-label">Berhasil</div><div className="stat-value">{s.berhasil}</div></div>
        <div className="stat-card warn"><div className="stat-label">Di Proses</div><div className="stat-value">{s.proses}</div></div>
        <div className="stat-card danger"><div className="stat-label">Belum</div><div className="stat-value">{s.belum}</div></div>
        <div className="stat-card muted"><div className="stat-label">Batal</div><div className="stat-value">{s.batal}</div></div>
      </div>
    );
  };

  const tampilkanKonten = () => {
    if (sedangMemuat) return <p>Memuat data transaksi...</p>;
    if (kesalahan) return <p style={{color: 'red'}}>Terjadi kesalahan: {kesalahan}.</p>;
    if (!transaksi || Object.keys(transaksi).length === 0) return <p>Belum ada data transaksi.</p>;

    return (
      <div className="wadah-tabel">
        <Toolbar />
        <table className="tabel-transaksi">
          <thead>
            <tr>
              <th>ID Transaksi</th>
              <th>Nama Pengirim</th>
              <th>Tanggal</th>
              <th>Nominal</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dataTerfilter().map(([id, data]) => (
              <tr key={id} onClick={() => tanganiBukaDetail(id, data)}>
                <td>{id}</td>
                <td>{data.nama}</td>
                <td>{new Date(data.tanggal).toLocaleString('id-ID', {dateStyle: 'medium', timeStyle: 'short'})}</td>
                <td>{formatMataUang(data.harga_transaksi)}</td>
                <td><span className={dapatkanKelasStatus(data.status_pembayaran_transaksi)}>{data.status_pembayaran_transaksi}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const KartuPengaturan = () => (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Pengaturan Aplikasi</h3>
      {!konfigurasi ? (
        <p>Memuat pengaturan...</p>
      ) : (
        <div className="settings-grid">
          <div>
            <label>Branding Name</label>
            <input className="input-formulir" value={konfigurasi.brandingName} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), brandingName: e.target.value })} />
          </div>
          <div>
            <label>Branding Handle</label>
            <input className="input-formulir" value={konfigurasi.brandingHandle} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), brandingHandle: e.target.value })} />
          </div>
          <div>
            <label>Avatar URL</label>
            <input className="input-formulir" value={konfigurasi.avatarUrl} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), avatarUrl: e.target.value })} />
            {konfigurasi.avatarUrl ? <img src={konfigurasi.avatarUrl} alt="avatar" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', border: '1px solid #eee', marginTop: 8 }} /> : null}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: reader.result, kind: 'avatar' }) });
                  const h = await r.json();
                  if (!h.success) throw new Error(h.message || 'Gagal upload');
                  aturKonfigurasi({ ...(konfigurasi as any), avatarUrl: h.url });
                } catch (err) {
                  alert((err as Error).message);
                }
              };
              reader.readAsDataURL(file);
            }} style={{ marginTop: 8 }} />
          </div>
          <div>
            <label>Cover URL</label>
            <input className="input-formulir" value={konfigurasi.coverUrl} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), coverUrl: e.target.value })} />
            {konfigurasi.coverUrl ? <img src={konfigurasi.coverUrl} alt="cover" style={{ width: '100%', maxWidth: 240, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', marginTop: 8 }} /> : null}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: reader.result, kind: 'cover' }) });
                  const h = await r.json();
                  if (!h.success) throw new Error(h.message || 'Gagal upload');
                  aturKonfigurasi({ ...(konfigurasi as any), coverUrl: h.url });
                } catch (err) {
                  alert((err as Error).message);
                }
              };
              reader.readAsDataURL(file);
            }} style={{ marginTop: 8 }} />
          </div>
          <div>
            <label>Target Goal (Rp)</label>
            <input className="input-formulir" type="number" value={konfigurasi.targetGoal} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), targetGoal: Number(e.target.value) })} />
          </div>
          <div>
            <label>Biaya Layanan (%)</label>
            <input className="input-formulir" type="number" step="0.001" value={konfigurasi.feePercent} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), feePercent: Number(e.target.value) })} />
          </div>
          <div>
            <label>Toleransi Pembayaran (%)</label>
            <input className="input-formulir" type="number" step="0.001" value={konfigurasi.paymentTolerancePercent} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), paymentTolerancePercent: Number(e.target.value) })} />
          </div>
          <div>
            <label>Toleransi Pembayaran Min (Rp)</label>
            <input className="input-formulir" type="number" value={konfigurasi.paymentToleranceMin} onChange={e => aturKonfigurasi({ ...(konfigurasi as any), paymentToleranceMin: Number(e.target.value) })} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="tombol-dukung" style={{ maxWidth: 220 }} onClick={SimpanKonfigurasi} disabled={!konfigurasi || sedangSimpanKonfig}>{sedangSimpanKonfig ? 'Menyimpan...' : 'Simpan Pengaturan'}</button>
      </div>
    </div>
  );

  const ModalDetail = () => {
    if (!transaksiTerpilih) return null;
    return (
        <div className={`modal ${modalDetailTerbuka ? 'aktif' : ''}`} onClick={() => aturModalDetailTerbuka(false)}>
            <div className="konten-modal" onClick={e => e.stopPropagation()}>
                <div className="kepala-modal">
                    <h3 className="judul-modal">Detail Transaksi</h3>
                    <button type="button" className="tutup-modal" onClick={() => aturModalDetailTerbuka(false)}>&times;</button>
                </div>
                <dl className="detail-list">
                    <div className="detail-item"><dt>ID Transaksi</dt><dd>{transaksiTerpilih.id}</dd></div>
                    <div className="detail-item"><dt>Nama</dt><dd>{transaksiTerpilih.nama}</dd></div>
                    <div className="detail-item"><dt>Email</dt><dd>{transaksiTerpilih.email}</dd></div>
                    <div className="detail-item"><dt>Pesan</dt><dd>{transaksiTerpilih.pesan || '-'}</dd></div>
                    <div className="detail-item"><dt>Tanggal</dt><dd>{new Date(transaksiTerpilih.tanggal).toLocaleString('id-ID')}</dd></div>
                    <div className="detail-item"><dt>Total Bayar</dt><dd>{formatMataUang(transaksiTerpilih.harga_transaksi)}</dd></div>
                    <div className="detail-item"><dt>Status</dt><dd><span className={dapatkanKelasStatus(transaksiTerpilih.status_pembayaran_transaksi)}>{transaksiTerpilih.status_pembayaran_transaksi}</span></dd></div>
                </dl>
                <div className="status-actions">
                    <h4>Ubah Status Transaksi</h4>
                    <div className="button-group">
                        <button className="btn-berhasil" onClick={() => tanganiUbahStatus('Berhasil')}>Berhasil</button>
                        <button className="btn-proses" onClick={() => tanganiUbahStatus('Di Proses')}>Di Proses</button>
                        <button className="btn-batal" onClick={() => tanganiUbahStatus('Dibatalkan')}>Dibatalkan</button>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  return (
    <>
      <Head>
        <title>Dashboard Transaksi - AutoFtBot69</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div className="wadah-dashboard">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
            <h1>Dashboard Transaksi</h1>
            <Link href="/" style={{ textDecoration: 'none', color: 'var(--warna-utama)'}}>
              ← Kembali ke Halaman Dukungan
            </Link>
        </div>
        <KartuStatistik />
        <div className="dashboard-grid">
          <div>{tampilkanKonten()}</div>
          <div><KartuPengaturan /></div>
        </div>
      </div>
      <ModalDetail />
    </>
  );
};

export default HalamanDasbor;
