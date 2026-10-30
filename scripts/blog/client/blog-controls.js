/**
 * Kontrol interaktif untuk halaman indeks blog STATIS (hasil prerender).
 *
 * KEPUTUSAN ARSITEKTUR F2 (2026-10-29, mengikuti audit blog):
 * Halaman blog publik adalah HTML statis tanpa JavaScript sama sekali,
 * sehingga filter kategori, pencarian, newsletter, dan pagination versi
 * React (BlogIndexPage) tidak berfungsi di sana — hanya hidup di fallback
 * SPA (BlogHostPage). Pilihan yang diambil: pertahankan arsitektur statis
 * (SEO & kecepatan tidak berubah) + file vanilla JS kecil ini, disalin
 * prerender ke dist/blog/blog.js dan dimuat dengan <script defer> HANYA
 * di halaman indeks statis.
 *
 * Trade-off yang disadari:
 * - Bukan hidrasi React: tidak ada sinkronisasi state dua arah; file ini
 *   mengoperasikan DOM hasil prerender (kartu membawa data-category &
 *   data-search dari BlogCard) dengan semantik yang sama persis dengan
 *   versi React (filter kategori toggle, pencarian substring pada
 *   judul+excerpt+kategori+tag, PAGE_SIZE 9, pesan newsletter yang sama).
 * - Tanpa JS, halaman tetap utuh sebagai dokumen statis (semua kartu
 *   tampil — prerender me-render semua kartu khusus untuk mode statis),
 *   hanya kontrolnya yang tidak aktif. Tidak ada konten yang hilang.
 * - SPA tidak memuat file ini (shell prerender saja), jadi tidak ada
 *   perilaku ganda.
 * - Newsletter TIDAK mengirim apa pun ke server: submit hanya menampilkan
 *   pesan status jujur yang sama dengan versi React ("pendaftaran segera
 *   dibuka"). Tidak ada API langganan yang dikarang.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 9;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var main = document.getElementById('artikel-terbaru');
    var grid = main ? main.querySelector('.ezb-grid') : null;
    var searchInput = document.getElementById('cari');

    // Fokuskan kolom cari bila tiba dengan #cari (ikon cari header,
    // termasuk dari halaman artikel — lihat F5).
    if (window.location.hash === '#cari' && searchInput) {
      searchInput.focus({ preventScroll: true });
      try {
        searchInput.scrollIntoView({ block: 'center' });
      } catch (err) {
        /* lingkungan tanpa scrollIntoView penuh — fokus saja cukup */
      }
    }

    initNewsletter();

    if (!main || !grid) return; // Halaman tanpa indeks: selesai.

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.ezb-card'));
    var catButtons = Array.prototype.slice.call(
      document.querySelectorAll('.ezb-cat-row')
    );
    var pagination = main.querySelector('.ezb-pagination');
    var stateBox = null;

    var activeCategory = 'Semua';
    var query = '';
    var page = 1;

    function cardMatches(card) {
      if (activeCategory !== 'Semua') {
        if (card.getAttribute('data-category') !== activeCategory) return false;
      }
      if (query) {
        var hay = (card.getAttribute('data-search') || '').toLowerCase();
        if (hay.indexOf(query) === -1) return false;
      }
      return true;
    }

    function ensureStateBox() {
      if (stateBox) return stateBox;
      stateBox = document.createElement('div');
      stateBox.className = 'ezb-state';
      stateBox.setAttribute('role', 'status');
      var h = document.createElement('h2');
      h.textContent = 'Tidak ada artikel ditemukan';
      var p = document.createElement('p');
      p.textContent = 'Coba kata kunci lain atau pilih kategori yang berbeda.';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ezb-btn-ghost';
      btn.textContent = 'Reset filter';
      btn.addEventListener('click', function () {
        query = '';
        if (searchInput) searchInput.value = '';
        activeCategory = 'Semua';
        page = 1;
        apply();
      });
      stateBox.appendChild(h);
      stateBox.appendChild(p);
      stateBox.appendChild(btn);
      main.insertBefore(stateBox, grid);
      return stateBox;
    }

    function renderPagination(totalPages, visibleCards) {
      if (!pagination) return;
      if (totalPages <= 1) {
        pagination.hidden = true;
        return;
      }
      pagination.hidden = false;
      // Bangun ulang tombol nomor agar jumlah halaman mengikuti filter.
      var buttons = Array.prototype.slice.call(pagination.querySelectorAll('button'));
      var prevBtn = buttons[0];
      var nextBtn = buttons[buttons.length - 1];
      buttons.slice(1, -1).forEach(function (b) {
        b.parentNode.removeChild(b);
      });
      for (var p = 1; p <= totalPages; p++) {
        (function (pageNum) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = String(pageNum);
          if (pageNum === page) b.setAttribute('aria-current', 'page');
          b.addEventListener('click', function () {
            page = pageNum;
            apply();
          });
          pagination.insertBefore(b, nextBtn);
        })(p);
      }
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= totalPages;
      prevBtn.onclick = function () {
        if (page > 1) {
          page -= 1;
          apply();
        }
      };
      nextBtn.onclick = function () {
        if (page < totalPages) {
          page += 1;
          apply();
        }
      };
      void visibleCards;
    }

    function apply() {
      var matched = cards.filter(cardMatches);
      var totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
      if (page > totalPages) page = totalPages;
      var start = (page - 1) * PAGE_SIZE;
      var visibleSet = {};
      matched.slice(start, start + PAGE_SIZE).forEach(function (c) {
        visibleSet[cards.indexOf(c)] = true;
      });
      cards.forEach(function (card, i) {
        card.hidden = !visibleSet[i];
      });

      catButtons.forEach(function (btn) {
        var nameEl = btn.querySelector('.ezb-cat-name');
        var name = nameEl ? nameEl.textContent.trim() : '';
        var active = name === activeCategory;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.title = active
          ? 'Klik lagi untuk tampilkan semua'
          : 'Filter: ' + name;
      });

      if (matched.length === 0) {
        grid.hidden = true;
        ensureStateBox().hidden = false;
      } else {
        grid.hidden = false;
        if (stateBox) stateBox.hidden = true;
      }
      renderPagination(totalPages, matched);
    }

    catButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nameEl = btn.querySelector('.ezb-cat-name');
        var name = nameEl ? nameEl.textContent.trim() : '';
        // Klik kategori aktif sekali lagi = reset ke Semua (sama seperti React).
        activeCategory = activeCategory === name ? 'Semua' : name;
        page = 1;
        apply();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        query = searchInput.value.trim().toLowerCase();
        page = 1;
        apply();
      });
      // Bila halaman dimuat dengan query awal (atribut value dari prerender
      // tidak dipakai — state awal selalu kosong), tidak ada yang diterapkan.
    }

    apply();
  });

  function initNewsletter() {
    var form = document.querySelector('.ezb-newsletter-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var email = input ? input.value.trim() : '';
      if (!email) return;
      // Pesan yang sama persis dengan versi React: jujur, tanpa klaim
      // langganan berhasil — belum ada layanan newsletter.
      var note = document.createElement('p');
      note.className = 'ezb-newsletter-note';
      note.setAttribute('role', 'status');
      note.textContent =
        'Terima kasih atas minatnya! Pendaftaran newsletter segera dibuka.';
      form.parentNode.replaceChild(note, form);
    });
  }
})();
