'use strict';

// 「動きを減らす」設定をOSで有効にしている人かどうか
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================
   1. カルーセル(エンドレス移動・中央カード連動ドット)
   ========================================================== */
const AUTO_INTERVAL = 5000;

function initCarousel(config) {
  const root = document.getElementById(config.rootId);
  const track = document.getElementById(config.trackId);
  const prevBtn = document.getElementById(config.prevId);
  const nextBtn = document.getElementById(config.nextId);
  const dotsWrap = document.getElementById(config.dotsId);
  const itemSelector = config.itemSelector || '.news-item';

  if (!root || !track || !prevBtn || !nextBtn || !dotsWrap) return null;

  const originalItems = Array.from(track.querySelectorAll(itemSelector));
  const total = originalItems.length;
  if (total === 0) return null;

  originalItems.forEach((item, idx) => {
    item.dataset.realIndex = String(idx);
  });

  // 画面幅に応じた表示枚数(--n)を取得
  const getVisibleCount = () => {
    const n = parseInt(getComputedStyle(track.parentElement).getPropertyValue('--n'), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  let cloneCount = 0;

  function rebuildClones() {
    track.querySelectorAll('.js-carousel-clone').forEach((el) => el.remove());
    cloneCount = Math.min(total, getVisibleCount() + 1);

    const makeClone = (item) => {
      const clone = item.cloneNode(true);
      clone.classList.add('js-carousel-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('button, a, input, [tabindex]').forEach((el) => {
        el.tabIndex = -1;
      });
      return clone;
    };

    // 末尾から cloneCount 個を先頭に複製
    const headClones = originalItems.slice(-cloneCount).map(makeClone);
    // 先頭から cloneCount 個を末尾に複製
    const tailClones = originalItems.slice(0, cloneCount).map(makeClone);

    track.prepend(...headClones);
    track.append(...tailClones);
  }

  const allItems = () => Array.from(track.querySelectorAll(itemSelector));

  // カードの中心をトラック中央に合わせるスクロール位置を計算
  function scrollLeftForItem(item) {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2;
    return itemCenter - track.clientWidth / 2;
  }

  // 今、トラック中央に一番近いカードのインデックス(allItems基準)を返す
  function nearestAllIndex() {
    const items = allItems();
    const trackCenter = track.scrollLeft + track.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    items.forEach((item, idx) => {
      const center = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(center - trackCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  // 本物の先頭(realIndex = 0)を中央に配置
  function jumpToRealStart(realIndex = 0, behavior = 'instant') {
    const targetItem = allItems().find(
      (el) => !el.classList.contains('js-carousel-clone') && Number(el.dataset.realIndex) === realIndex
    );
    if (!targetItem) return;
    track.scrollTo({ left: scrollLeftForItem(targetItem), behavior });
  }

  // クローン領域に入っていたら、同じ見た目の本物位置へ瞬間移動してループさせる
  function wrapIfNeeded() {
    const items = allItems();
    const currentItem = items[nearestAllIndex()];
    if (!currentItem || !currentItem.classList.contains('js-carousel-clone')) return;

    const realIdx = Number(currentItem.dataset.realIndex);
    jumpToRealStart(realIdx, 'instant');
  }

  // 1カード分ずつ前後へ移動
  function stepBy(delta) {
    const items = allItems();
    const baseIdx = nearestAllIndex();
    const nextIdx = Math.max(0, Math.min(items.length - 1, baseIdx + delta));
    track.scrollTo({
      left: scrollLeftForItem(items[nextIdx]),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    syncAutoplay();
  }

  // --- インジケーター(カード枚数ぶん作成) ---
  function buildDots() {
    dotsWrap.replaceChildren();
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel__dot';
      dot.setAttribute('aria-label', `${i + 1}番目のカードへ移動`);
      dot.addEventListener('click', () => {
        jumpToRealStart(i, reduceMotion ? 'auto' : 'smooth');
        syncAutoplay();
      });
      dotsWrap.append(dot);
    }
    root.classList.toggle('is-static', total <= 1);
    updateDots();
  }

  function updateDots() {
    const currentItem = allItems()[nearestAllIndex()];
    const activeReal = currentItem ? Number(currentItem.dataset.realIndex) : 0;
    dotsWrap.querySelectorAll('.carousel__dot').forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === activeReal));
    });
  }

  // --- 自動スライド ---
  const state = {
    userPaused: reduceMotion,
    hover: false,
    focus: false,
    modal: false,
    hidden: document.hidden,
    inView: true,
  };
  let timer = null;

  function syncAutoplay() {
    clearTimeout(timer);
    const canRun = !state.userPaused && !state.hover && !state.focus &&
                   !state.modal && !state.hidden && state.inView && total > 1;
    if (canRun) timer = setTimeout(() => stepBy(1), AUTO_INTERVAL);
  }

  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { state.hover = true; syncAutoplay(); } });
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { state.hover = false; syncAutoplay(); } });
  root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { state.focus = true; syncAutoplay(); } });
  root.addEventListener('focusout', () => { state.focus = false; syncAutoplay(); });
  root.addEventListener('pointerdown', syncAutoplay);
  document.addEventListener('visibilitychange', () => { state.hidden = document.hidden; syncAutoplay(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { state.inView = entry.isIntersecting; syncAutoplay(); }).observe(root);
  }

  // スクロールが止まったタイミングでクローン→本物へワープ
  let scrollEndTimer = null;
  track.addEventListener('scroll', () => {
    updateDots();
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(wrapIfNeeded, 120);
  }, { passive: true });
  if ('scrollend' in track) {
    track.addEventListener('scrollend', wrapIfNeeded, { passive: true });
  }

  prevBtn.addEventListener('click', () => stepBy(-1));
  nextBtn.addEventListener('click', () => stepBy(1));

  function handleResize() {
    const currentItem = allItems()[nearestAllIndex()];
    const activeReal = currentItem ? Number(currentItem.dataset.realIndex) : 0;
    rebuildClones();
    jumpToRealStart(activeReal, 'instant');
    updateDots();
  }

  rebuildClones();
  buildDots();
  requestAnimationFrame(() => {
    jumpToRealStart(0, 'instant');
    updateDots();
    syncAutoplay();
  });

  if ('ResizeObserver' in window) {
    let resizeTimer = null;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 100);
    }).observe(track);
  }

  return { setModalOpen(open) { state.modal = open; syncAutoplay(); } };
}

const newsCarousel = initCarousel({
  rootId: 'news-carousel',
  trackId: 'news-track',
  prevId: 'news-prev',
  nextId: 'news-next',
  dotsId: 'news-dots',
  itemSelector: '.news-item',
});

const worksCarousel = initCarousel({
  rootId: 'works-carousel',
  trackId: 'works-track',
  prevId: 'works-prev',
  nextId: 'works-next',
  dotsId: 'works-dots',
  itemSelector: '.news-item',
});

/* ==========================================================
   2. お知らせをクリックしたら詳細をウィンドウ表示
      HTMLの <dialog> を使うので、Escキーで閉じる動作などは標準で動く
   ========================================================== */
const dialog = document.getElementById('news-dialog');
const newsTrack = document.getElementById('news-track');

if (dialog) {
  const dialogImage = dialog.querySelector('.modal__image');
  const dialogContent = dialog.querySelector('.modal__content');
  const closeBtn = dialog.querySelector('.modal__close');

  if (newsTrack && dialogImage && dialogContent) {
    newsTrack.addEventListener('click', (e) => {
      const card = e.target.closest('.news-card');
      if (!card) return;
      const item = card.closest('.news-item');
      const detail = item && item.querySelector('.news-detail');
      const image = card.querySelector('img');
      if (!detail || !image) return;

      dialogImage.src = image.src;
      dialogContent.innerHTML = detail.innerHTML;
      dialog.showModal();
      document.body.classList.add('is-locked');
      if (newsCarousel) newsCarousel.setModalOpen(true);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => dialog.close());
  }

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    if (newsCarousel) newsCarousel.setModalOpen(false);
  });
}

/* ==========================================================
   3. ねこ画像のランダム表示
   ========================================================== */
const DECO_IMAGES = [
  "images/neko/buruburu.png",
  "images/neko/gokigen.png",
  "images/neko/jitome.png",
  "images/neko/kirakira.png",
  "images/neko/melt.png",
  "images/neko/mikaeri.png",
  "images/neko/minineko.png",
  "images/neko/mouthopen.png",
  "images/neko/mumu.png",
  "images/neko/mumumu.png",
  "images/neko/mun.png",
  "images/neko/newyear.png",
  "images/neko/nomal.png",
  "images/neko/nyugaku.png",
  "images/neko/point.png",
  "images/neko/santa.png",
  "images/neko/scissors.png",
  "images/neko/shobon.png",
  "images/neko/siosatou.png",
];

document.addEventListener("DOMContentLoaded", () => {
  const decoImgs = document.querySelectorAll("img.section__deco");
  if (decoImgs.length === 0 || DECO_IMAGES.length === 0) return;

  const pool = [...DECO_IMAGES].sort(() => Math.random() - 0.5);

  decoImgs.forEach((img, index) => {
    img.src = pool[index % pool.length];
  });
});