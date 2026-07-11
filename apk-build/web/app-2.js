function validateData(markFields = true) {
  const data = collectFormData();
  const errors = [];
  const requiredFields = [
    ['storeName', '请填写店铺名称'],
    ['storeId', '请填写店铺 ID'],
    ['establishedDate', '请选择店铺成立时间'],
    ['dailyTurnover', '请填写店铺日均流水'],
    ['priceMin', '请填写商品最低价'],
    ['priceMax', '请填写商品最高价'],
    ['totalSales', '请填写总销售额'],
    ['incomingPhone', '请填写进账人手机号'],
    ['storeLink', '请填写门店链接']
  ];

  document.querySelectorAll('.invalid').forEach(node => node.classList.remove('invalid'));
  document.querySelectorAll('.photo-slot.missing').forEach(node => node.classList.remove('missing'));

  for (const [id, message] of requiredFields) {
    if (!data[id]) {
      errors.push(message);
      if (markFields) el(id).classList.add('invalid');
    }
  }

  if (data.incomingPhone && !/^[0-9+()\-\s]{6,20}$/.test(data.incomingPhone)) {
    errors.push('进账人手机号格式可能不正确');
    if (markFields) el('incomingPhone').classList.add('invalid');
  }

  if (data.priceMin && data.priceMax && Number(data.priceMin) > Number(data.priceMax)) {
    errors.push('商品最低价不能高于最高价');
    if (markFields) {
      el('priceMin').classList.add('invalid');
      el('priceMax').classList.add('invalid');
    }
  }

  for (const slot of photoSlotsConfig) {
    if (!state.photos.has(slot.id)) {
      errors.push(`缺少：${slot.title}`);
      if (markFields) photoSlots.querySelector(`[data-slot-id="${slot.id}"]`)?.classList.add('missing');
    }
  }

  if (markFields) renderValidation(errors);
  return { valid: errors.length === 0, errors, data };
}

function renderValidation(errors) {
  if (!errors.length) {
    validationBox.className = 'validation-box success';
    validationBox.innerHTML = `
      <div class="validation-icon">✓</div>
      <div><strong>资料检查通过</strong><p>Word 文本和 13 张照片已齐全，顺序已经按现场、平台、经营三组整理。</p></div>`;
    validationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  validationBox.className = 'validation-box error';
  validationBox.innerHTML = `
    <div class="validation-icon">!</div>
    <div><strong>还有 ${errors.length} 项需要处理</strong><ul class="validation-list">${errors.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
  validationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concatArrays(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function writeUint16(view, offset, value) { view.setUint16(offset, value, true); }
function writeUint32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

async function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return new TextEncoder().encode(String(data));
}

async function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name.replace(/^\/+/, ''));
    const dataBytes = await toUint8(entry.data);
    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    writeUint32(lv, 0, 0x04034b50);
    writeUint16(lv, 4, 20);
    writeUint16(lv, 6, 0x0800);
    writeUint16(lv, 8, 0);
    writeUint16(lv, 10, now.time);
    writeUint16(lv, 12, now.date);
    writeUint32(lv, 14, crc);
    writeUint32(lv, 18, dataBytes.length);
    writeUint32(lv, 22, dataBytes.length);
    writeUint16(lv, 26, nameBytes.length);
    writeUint16(lv, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    writeUint32(cv, 0, 0x02014b50);
    writeUint16(cv, 4, 20);
    writeUint16(cv, 6, 20);
    writeUint16(cv, 8, 0x0800);
    writeUint16(cv, 10, 0);
    writeUint16(cv, 12, now.time);
    writeUint16(cv, 14, now.date);
    writeUint32(cv, 16, crc);
    writeUint32(cv, 20, dataBytes.length);
    writeUint32(cv, 24, dataBytes.length);
    writeUint16(cv, 28, nameBytes.length);
    writeUint16(cv, 30, 0);
    writeUint16(cv, 32, 0);
    writeUint16(cv, 34, 0);
    writeUint16(cv, 36, 0);
    writeUint32(cv, 38, 0);
    writeUint32(cv, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + dataBytes.length;
  }

  const centralData = concatArrays(centralParts);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  writeUint32(ev, 0, 0x06054b50);
  writeUint16(ev, 4, 0);
  writeUint16(ev, 6, 0);
  writeUint16(ev, 8, entries.length);
  writeUint16(ev, 10, entries.length);
  writeUint32(ev, 12, centralData.length);
  writeUint32(ev, 16, offset);
  writeUint16(ev, 20, 0);
  return new Blob([...localParts, centralData, end], { type: 'application/zip' });
}

function textParagraph(number, label, value, options = {}) {
  const suffix = options.unit ? `${value}${options.unit}` : value;
  const finalValue = suffix || '—';
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="25"/></w:rPr><w:t>${number}. ${escapeXml(label)}：</w:t></w:r><w:r><w:rPr><w:sz w:val="25"/></w:rPr><w:t xml:space="preserve">${escapeXml(finalValue)}</w:t></w:r></w:p>`;
}

function headingParagraph(number, label) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="25"/></w:rPr><w:t>${number}. ${escapeXml(label)}：</w:t></w:r></w:p>`;
}

function calculateImageEmu(photo) {
  const maxWidth = 5_700_000;
  const maxHeight = 7_100_000;
  const width = Math.max(1, Number(photo.width) || 1600);
  const height = Math.max(1, Number(photo.height) || 1200);
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { cx: Math.round(width * scale), cy: Math.round(height * scale) };
}

function imageDrawing(relId, imageIndex, photo) {
  const { cx, cy } = calculateImageEmu(photo);
  return `<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:after="180"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imageIndex}" name="图片${imageIndex}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageIndex}" name="图片${imageIndex}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function createDocx(data) {
  const relationshipRows = [];
  const mediaEntries = [];
  const imageMeta = new Map();

  photoSlotsConfig.forEach((slot, index) => {
    const photo = state.photos.get(slot.id);
    const relId = `rId${index + 1}`;
    const mediaName = `image${index + 1}.jpg`;
    relationshipRows.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`);
    mediaEntries.push({ name: `word/media/${mediaName}`, data: photo.blob });
    imageMeta.set(slot.id, { relId, imageIndex: index + 1, photo });
  });

  const imageSection = (number, title, ids) => {
    let xml = headingParagraph(number, title);
    ids.forEach(id => {
      const meta = imageMeta.get(id);
      xml += imageDrawing(meta.relId, meta.imageIndex, meta.photo);
    });
    return xml;
  };

  const priceRange = `${data.priceMin}-${data.priceMax}`;
  const bodyXml = [
    textParagraph(1, '店铺 ID', data.storeId),
    textParagraph(2, '店铺成立时间', formatChineseDate(data.establishedDate)),
    imageSection(3, '店铺链接二维码图片', ['qr']),
    textParagraph(4, '店铺日均流水（万）', data.dailyTurnover),
    textParagraph(5, '店铺商品价格范围（元）', priceRange),
    textParagraph(6, '总销售额（万）', data.totalSales),
    imageSection(7, '入驻平台截图', ['platform']),
    imageSection(8, '来客店铺首页截图', ['homepage']),
    imageSection(9, '店铺后台订单记录截图', ['orders']),
    imageSection(10, '店铺平台经营数据总览截图', ['overview']),
    textParagraph(11, '进账人手机号', data.incomingPhone),
    imageSection(12, '平台结算账户截图', ['settlement']),
    imageSection(13, '营业执照', ['license']),
    imageSection(14, '法人身份证', ['idFront', 'idBack']),
    imageSection(15, '抖音门店截图', ['douyin']),
    textParagraph(16, '门店链接', data.storeLink),
    imageSection(17, '结算银行卡', ['bank']),
    imageSection(18, '商户门头照', ['storefront']),
    imageSection(19, '店内环境照片', ['interior'])
  ].join('');

  const remarksXml = data.remarks
    ? `<w:p><w:pPr><w:spacing w:before="220"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>补充备注：</w:t></w:r><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(data.remarks)}</w:t></w:r></w:p>`
    : '';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
  <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="300"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/></w:rPr><w:t>${escapeXml(data.storeName)}门店资料</w:t></w:r></w:p>
  ${bodyXml}
  ${remarksXml}
  <w:p><w:pPr><w:spacing w:before="240"/></w:pPr><w:r><w:rPr><w:color w:val="6B7588"/><w:sz w:val="18"/></w:rPr><w:t>采集日期：${escapeXml(formatChineseDate(data.collectDate))}　提交人：${escapeXml(data.salesperson || '未填写')}</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr>
</w:body>
</w:document>`;

  const entries = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipRows.join('')}</Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(data.storeName)}门店资料</dc:title><dc:creator>抖音门店资料打包助手</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Douyin Store Material Packer</Application></Properties>` },
    ...mediaEntries
  ];

  return createZip(entries);
}
