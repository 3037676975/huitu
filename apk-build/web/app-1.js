'use strict';

const uploadGroups = [
  { id: 'onsite', title: '先拍现场与证照', subtitle: '连续使用相机完成，减少来回切换。' },
  { id: 'platform', title: '再截门店与平台页面', subtitle: '依次打开平台页面截图，店名和关键信息要完整。' },
  { id: 'operation', title: '最后补经营与结算', subtitle: '订单、经营数据和结算账户放在一起，审核更顺。' }
];

const photoSlotsConfig = [
  { id: 'license', group: 'onsite', title: '营业执照', hint: '完整拍摄，四角、名称和统一社会信用代码清晰', docNumber: 13, sourceNumber: 7 },
  { id: 'idFront', group: 'onsite', title: '法人身份证正面', hint: '人像面完整，避免反光和遮挡', docNumber: 14, sourceNumber: 8 },
  { id: 'idBack', group: 'onsite', title: '法人身份证反面', hint: '国徽面完整，签发机关和有效期清晰', docNumber: 14, sourceNumber: 9 },
  { id: 'bank', group: 'onsite', title: '结算银行卡照片', hint: '卡面完整清晰，卡号和开户人信息可辨认', docNumber: 17, sourceNumber: 10 },
  { id: 'storefront', group: 'onsite', title: '门头照片', hint: '完整店名、门头和实际经营场所同时入镜', docNumber: 18, sourceNumber: 11 },
  { id: 'interior', group: 'onsite', title: '店内环境照片', hint: '拍到真实经营环境，画面明亮且范围完整', docNumber: 19, sourceNumber: 12 },
  { id: 'platform', group: 'platform', title: '入驻平台截图', hint: '显示主体资质和门店已入驻平台的信息', docNumber: 7, sourceNumber: 2, example: 'examples/platform.svg', exampleNote: '来自 1.docx 第 2 项的入驻平台截图示例。' },
  { id: 'homepage', group: 'platform', title: '来客店铺首页截图', hint: '显示来客首页、店铺名称和核心经营入口', docNumber: 8, sourceNumber: 3, example: 'examples/homepage.svg', exampleNote: '来自 1.docx 第 3 项的来客店铺首页截图示例。' },
  { id: 'douyin', group: 'platform', title: '抖音门店截图', hint: '显示抖音门店名称、商品和门店主页信息', docNumber: 15, sourceNumber: 13, example: 'examples/douyin.svg', exampleNote: '来自 1.docx 第 13 项的抖音门店截图示例。' },
  { id: 'qr', group: 'platform', title: '店铺链接二维码', hint: '二维码完整、清晰，确保扫码能够识别', docNumber: 3, sourceNumber: 1, example: 'examples/qr.svg', exampleNote: '来自 1.docx 第 1 项的店铺链接二维码示例。' },
  { id: 'orders', group: 'operation', title: '店铺后台订单记录', hint: '保留订单列表、金额和时间等关键区域', docNumber: 9, sourceNumber: 4, example: 'examples/orders.svg', exampleNote: '来自 1.docx 第 4 项的店铺后台订单记录示例。' },
  { id: 'overview', group: 'operation', title: '平台经营数据总览', hint: '显示销售额、核销、订单等经营数据', docNumber: 10, sourceNumber: 5, example: 'examples/overview.svg', exampleNote: '来自 1.docx 第 5 项的平台经营数据总览示例。' },
  { id: 'settlement', group: 'operation', title: '平台结算账户', hint: '显示结算账户、到账或账户状态信息', docNumber: 12, sourceNumber: 6, example: 'examples/settlement.svg', exampleNote: '来自 1.docx 第 6 项的平台结算账户示例。' }
];

const state = {
  photos: new Map(),
  currentDraftId: null,
  installPrompt: null,
  openGroups: new Set(['onsite'])
};

const el = id => document.getElementById(id);
const form = el('merchantForm');
const photoSlots = el('photoSlots');
const buildZipBtn = el('buildZipBtn');
const validationBox = el('validationBox');
const recordsList = el('recordsList');
const toast = el('toast');
const exampleModal = el('exampleModal');
const exampleImage = el('exampleImage');
const exampleTitle = el('exampleTitle');
const exampleNote = el('exampleNote');

el('collectDate').value = toDateInput(new Date());

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatChineseDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${Number(year)} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openExample(slot) {
  exampleTitle.textContent = `${slot.title} · 原清单第 ${slot.sourceNumber} 项`;
  exampleImage.src = slot.example;
  exampleImage.alt = `${slot.title}示例`;
  exampleNote.textContent = slot.exampleNote;
  exampleModal.classList.add('show');
  exampleModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeExample() {
  exampleModal.classList.remove('show');
  exampleModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function sanitizeName(name, fallback = '未命名店铺') {
  const cleaned = String(name || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
  return cleaned.slice(0, 80) || fallback;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function advanceGroupIfComplete(groupId) {
  const slots = photoSlotsConfig.filter(slot => slot.group === groupId);
  if (!slots.every(slot => state.photos.has(slot.id))) return;
  const index = uploadGroups.findIndex(group => group.id === groupId);
  const next = uploadGroups[index + 1];
  if (!next) return;
  state.openGroups.delete(groupId);
  state.openGroups.add(next.id);
}

function renderPhotoSlots() {
  for (const img of photoSlots.querySelectorAll('img.preview')) {
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  }
  photoSlots.innerHTML = '';

  uploadGroups.forEach(group => {
    const groupSlots = photoSlotsConfig.filter(slot => slot.group === group.id);
    const groupSection = document.createElement('section');
    const isOpen = state.openGroups.has(group.id);
    const groupDone = groupSlots.filter(slot => state.photos.has(slot.id)).length;
    groupSection.className = `upload-group ${isOpen ? '' : 'collapsed'}`;
    groupSection.innerHTML = `
      <div class="upload-group-heading">
        <div>
          <h3>${group.title}</h3>
          <p>${group.subtitle}</p>
        </div>
        <button class="group-toggle" type="button" aria-expanded="${isOpen}">
          <span>${groupDone} / ${groupSlots.length}</span>
          <b>${isOpen ? '收起' : '展开'}</b>
        </button>
      </div>
      <div class="photo-grid"></div>`;
    groupSection.querySelector('.group-toggle').addEventListener('click', () => {
      if (state.openGroups.has(group.id)) state.openGroups.delete(group.id);
      else state.openGroups.add(group.id);
      renderPhotoSlots();
    });
    const grid = groupSection.querySelector('.photo-grid');

    groupSlots.forEach(slot => {
      const index = photoSlotsConfig.findIndex(item => item.id === slot.id);
      const fileData = state.photos.get(slot.id);
      const wrapper = document.createElement('article');
      wrapper.className = `photo-slot required ${fileData ? 'has-file' : ''}`;
      wrapper.dataset.slotId = slot.id;
      wrapper.innerHTML = `
        <input class="slot-input" type="file" accept="image/*" capture="environment" aria-label="上传${slot.title}" />
        ${fileData ? `<img class="preview" alt="${slot.title}预览" />` : ''}
        <div class="slot-inner">
          <div class="slot-topline">
            <span class="slot-number">${index + 1}</span>
            <span class="source-tag">原清单第 ${slot.sourceNumber} 项</span>
            <span class="required-tag">必传</span>
          </div>
          <div class="slot-copy">
            <span class="slot-title">${slot.title}</span>
            <span class="slot-meta">${fileData ? `${fileData.originalName || slot.title} · ${formatBytes(fileData.blob.size)}` : slot.hint}</span>
          </div>
          <div class="slot-actions ${slot.group === 'onsite' ? 'no-example' : ''}">
            <button class="upload-photo" type="button">${fileData ? '重新上传' : '拍照 / 上传'}</button>
            ${slot.group === 'onsite' ? '' : '<button class="example-photo" type="button">查看示例</button>'}
            ${fileData ? '<button class="remove-photo" type="button">删除</button>' : ''}
          </div>
        </div>`;

      const input = wrapper.querySelector('.slot-input');
      wrapper.querySelector('.upload-photo').addEventListener('click', () => input.click());
      wrapper.querySelector('.example-photo')?.addEventListener('click', () => openExample(slot));

      input.addEventListener('change', async event => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          showToast('这里只能上传图片');
          return;
        }
        try {
          wrapper.classList.remove('missing');
          wrapper.querySelector('.slot-meta').textContent = '正在压缩并校正图片…';
          const processed = await compressImage(file);
          state.photos.set(slot.id, {
            blob: processed.blob,
            ext: 'jpg',
            width: processed.width,
            height: processed.height,
            originalName: file.name,
            displayName: slot.title
          });
          advanceGroupIfComplete(slot.group);
          renderPhotoSlots();
          autoSaveQuietly();
          showToast(`${slot.title}已保存`);
        } catch (error) {
          console.error(error);
          showToast('图片处理失败，请换一张重试');
          renderPhotoSlots();
        }
      });

      wrapper.querySelector('.remove-photo')?.addEventListener('click', () => {
        state.photos.delete(slot.id);
        renderPhotoSlots();
        autoSaveQuietly();
      });

      if (fileData) wrapper.querySelector('.preview').src = URL.createObjectURL(fileData.blob);
      grid.appendChild(wrapper);
    });

    photoSlots.appendChild(groupSection);
  });
  updateProgress();
}

function updateProgress() {
  const done = photoSlotsConfig.filter(item => state.photos.has(item.id)).length;
  el('uploadProgressText').textContent = `${done} / ${photoSlotsConfig.length}`;
  el('progressBar').style.width = `${(done / photoSlotsConfig.length) * 100}%`;
}

async function compressImage(file) {
  const maxDimension = 2400;
  const quality = 0.86;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadImageFallback(file);
  }
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
  });
  return { blob, width, height };
}

function loadImageFallback(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}

function collectFormData() {
  return {
    storeName: el('storeName').value.trim(),
    storeId: el('storeId').value.trim(),
    establishedDate: el('establishedDate').value,
    dailyTurnover: el('dailyTurnover').value.trim(),
    priceMin: el('priceMin').value.trim(),
    priceMax: el('priceMax').value.trim(),
    totalSales: el('totalSales').value.trim(),
    incomingPhone: el('incomingPhone').value.trim(),
    storeLink: el('storeLink').value.trim(),
    salesperson: el('salesperson').value.trim(),
    collectDate: el('collectDate').value,
    remarks: el('remarks').value.trim(),
    updatedAt: new Date().toISOString()
  };
}
