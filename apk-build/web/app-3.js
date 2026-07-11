async function buildPackage() {
  const result = validateData(true);
  if (!result.valid) {
    showToast('请先补齐缺失资料');
    return;
  }

  buildZipBtn.disabled = true;
  buildZipBtn.textContent = '正在生成 Word 和 ZIP…';
  try {
    const data = result.data;
    const storeName = sanitizeName(data.storeName);
    const folder = `${storeName}/`;
    const docx = await createDocx(data);
    const entries = [{ name: `${folder}${storeName}.docx`, data: docx }];

    photoSlotsConfig.forEach((slot, index) => {
      const photo = state.photos.get(slot.id);
      entries.push({ name: `${folder}图片${index + 1}.jpg`, data: photo.blob });
    });

    const zip = await createZip(entries);
    const zipName = `${storeName}.zip`;
    await downloadBlob(zip, zipName);
    try {
      const savedId = await saveRecord('packed', zipName);
      state.currentDraftId = savedId;
      await refreshRecords();
    } catch (storageError) {
      console.warn('本地记录保存不可用，但资料包已正常生成', storageError);
    }
    showToast('资料包已生成：Word + 图片1～图片13');
  } catch (error) {
    console.error(error);
    showToast('生成失败，请重试或减少超大照片');
  } finally {
    buildZipBtn.disabled = false;
    buildZipBtn.textContent = '生成 ZIP 资料包';
  }
}

async function downloadBlob(blob, filename) {
  if (window.AndroidBridge && typeof window.AndroidBridge.beginDownload === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    window.AndroidBridge.beginDownload(filename, blob.type || 'application/zip', bytes.length);
    const chunkSize = 96 * 1024;
    for (let start = 0; start < bytes.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, bytes.length);
      let binary = '';
      for (let offset = start; offset < end; offset += 8192) {
        const part = bytes.subarray(offset, Math.min(offset + 8192, end));
        binary += String.fromCharCode(...part);
      }
      window.AndroidBridge.appendDownload(btoa(binary));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const result = window.AndroidBridge.finishDownload();
    if (String(result || '').startsWith('ERROR:')) throw new Error(result);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('douyin-store-material-packer-v3.1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAction(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', mode);
    const store = tx.objectStore('records');
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

async function getAllRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveRecord(status = 'draft', packedName = '') {
  const data = collectFormData();
  const id = state.currentDraftId || (crypto.randomUUID ? crypto.randomUUID() : `draft-${Date.now()}-${Math.random()}`);
  const photos = [];
  for (const [slotId, item] of state.photos.entries()) {
    photos.push({ slotId, blob: item.blob, ext: item.ext, width: item.width, height: item.height, originalName: item.originalName, displayName: item.displayName });
  }
  const existing = state.currentDraftId ? await getRecord(id) : null;
  const record = {
    id,
    status,
    packedName,
    data,
    photos,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await dbAction('readwrite', store => store.put(record));
  state.currentDraftId = id;
  return id;
}

async function deleteRecord(id) {
  await dbAction('readwrite', store => store.delete(id));
  if (state.currentDraftId === id) state.currentDraftId = null;
}

async function clearRecords() {
  await dbAction('readwrite', store => store.clear());
  state.currentDraftId = null;
}

async function loadRecord(id) {
  const record = await getRecord(id);
  if (!record) return;
  const data = record.data || {};
  Object.entries(data).forEach(([key, value]) => {
    const node = document.getElementById(key);
    if (node) node.value = value ?? '';
  });
  state.photos.clear();
  for (const photo of record.photos || []) {
    state.photos.set(photo.slotId, {
      blob: photo.blob,
      ext: photo.ext,
      width: photo.width,
      height: photo.height,
      originalName: photo.originalName,
      displayName: photo.displayName
    });
  }
  state.currentDraftId = id;
  const firstIncomplete = uploadGroups.find(group => photoSlotsConfig.filter(slot => slot.group === group.id).some(slot => !state.photos.has(slot.id)));
  state.openGroups = new Set([firstIncomplete?.id || 'onsite']);
  renderPhotoSlots();
  resetValidationBox();
  switchPage('collect');
  showToast('草稿已恢复');
}

async function refreshRecords() {
  try {
    const records = (await getAllRecords()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    el('recordCount').textContent = String(records.length);
    recordsList.innerHTML = '';
    if (!records.length) {
      recordsList.innerHTML = '<div class="empty-state"><strong>还没有保存记录</strong><p>填写资料后点击“保存草稿”，这里会显示本机记录。</p></div>';
      return;
    }
    for (const record of records) {
      const item = document.createElement('article');
      item.className = 'record-item';
      item.innerHTML = `
        <div class="record-main">
          <h3>${escapeHtml(record.data?.storeName || '未命名店铺')}</h3>
          <p>店铺 ID：${escapeHtml(record.data?.storeId || '未填写')} · ${record.photos?.length || 0} / 13 张图片</p>
          <span class="record-status ${record.status === 'packed' ? 'packed' : 'draft'}">${record.status === 'packed' ? '已生成资料包' : '草稿'} · ${formatDateTime(record.updatedAt)}</span>
        </div>
        <div class="record-actions">
          <button class="small-btn load" type="button">继续编辑</button>
          <button class="small-btn duplicate" type="button">复制一份</button>
          <button class="small-btn delete" type="button">删除</button>
        </div>`;
      item.querySelector('.load').addEventListener('click', () => loadRecord(record.id));
      item.querySelector('.duplicate').addEventListener('click', async () => {
        const copy = typeof structuredClone === 'function' ? structuredClone(record) : { ...record, data: { ...(record.data || {}) }, photos: [...(record.photos || [])] };
        copy.id = crypto.randomUUID ? crypto.randomUUID() : `copy-${Date.now()}`;
        copy.status = 'draft';
        copy.packedName = '';
        copy.data = { ...copy.data, storeName: `${copy.data?.storeName || '未命名店铺'}（复制）` };
        copy.createdAt = copy.updatedAt = new Date().toISOString();
        await dbAction('readwrite', store => store.put(copy));
        await refreshRecords();
        showToast('已复制一份草稿');
      });
      item.querySelector('.delete').addEventListener('click', async () => {
        if (!confirm(`确定删除“${record.data?.storeName || '该记录'}”吗？`)) return;
        await deleteRecord(record.id);
        await refreshRecords();
        showToast('记录已删除');
      });
      recordsList.appendChild(item);
    }
  } catch (error) {
    console.error(error);
    recordsList.innerHTML = '<div class="empty-state">浏览器不支持本地草稿存储，但仍可直接生成 ZIP。</div>';
  }
}

let autoSaveTimer;
function autoSaveQuietly() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!el('storeName').value.trim() && state.photos.size === 0) return;
    try { await saveRecord('draft'); await refreshRecords(); } catch (error) { console.warn('autosave failed', error); }
  }, 700);
}

function resetValidationBox() {
  validationBox.className = 'validation-box neutral';
  validationBox.innerHTML = '<div class="validation-icon">✓</div><div><strong>填写完成后点击检查</strong><p>系统会检查 9 项必填文本和 13 张必传图片。</p></div>';
}

function resetForm(ask = true) {
  if (ask && !confirm('确定清空当前填写内容和照片吗？')) return;
  form.reset();
  el('collectDate').value = toDateInput(new Date());
  state.photos.clear();
  state.currentDraftId = null;
  state.openGroups = new Set(['onsite']);
  renderPhotoSlots();
  resetValidationBox();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(node => node.classList.toggle('active', node.id === `page-${page}`));
  document.querySelectorAll('.nav-btn').forEach(node => node.classList.toggle('active', node.dataset.page === page));
  if (page === 'records') refreshRecords();
}

form.addEventListener('input', event => {
  if (event.target.classList.contains('invalid') && String(event.target.value).trim()) event.target.classList.remove('invalid');
  autoSaveQuietly();
});
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
el('validateBtn').addEventListener('click', () => validateData(true));
buildZipBtn.addEventListener('click', buildPackage);
el('saveDraftBtn').addEventListener('click', async () => {
  try { await saveRecord('draft'); await refreshRecords(); showToast('草稿已保存在当前设备'); }
  catch (error) { console.error(error); showToast('保存失败，请检查浏览器存储权限'); }
});
el('resetBtn').addEventListener('click', () => resetForm(true));
el('clearRecordsBtn').addEventListener('click', async () => {
  if (!confirm('确定清空当前设备上的全部草稿和记录吗？')) return;
  await clearRecords();
  await refreshRecords();
  showToast('全部记录已清空');
});

el('exampleCloseBtn').addEventListener('click', closeExample);
exampleModal.addEventListener('click', event => {
  if (event.target === exampleModal) closeExample();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && exampleModal.classList.contains('show')) closeExample();
});

renderPhotoSlots();
refreshRecords();
