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

  const tampilkanKonten = () => {
    if (sedangMemuat) return <p>Memuat data transaksi...</p>;
    if (kesalahan) return <p style={{color: 'red'}}>Terjadi kesalahan: {kesalahan}.</p>;
    if (!transaksi || Object.keys(transaksi).length === 0) return <p>Belum ada data transaksi.</p>;

    return (
      <div className="wadah-tabel">
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
            {Object.entries(transaksi)
              .sort(([,a], [,b]) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
              .map(([id, data]) => (
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
            <Link href="/dukungan" style={{ textDecoration: 'none', color: 'var(--warna-utama)'}}>
              ← Kembali ke Halaman Dukungan
            </Link>
        </div>
        {tampilkanKonten()}
      </div>
      <ModalDetail />
    </>
  );
};

export default HalamanDasbor;
