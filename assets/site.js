'use strict';
(() => {
  const english = document.documentElement.lang === 'en';
  const text = (ar, en) => english ? en : ar;
  const menuButton = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (menuButton && menu) {
    const setMenu = (open) => {
      menu.hidden = !open;
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? text('إغلاق القائمة', 'Close menu') : text('فتح القائمة', 'Open menu'));
    };
    menuButton.addEventListener('click', () => setMenu(menu.hidden));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuButton.focus(); } });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !menuButton.contains(e.target)) setMenu(false); });
    window.matchMedia('(min-width: 1280px)').addEventListener('change', e => { if (e.matches) setMenu(false); });
  }

  const blog = document.querySelector('[data-blog]');
  if (blog) {
    let category = 'all';
    const search = document.getElementById('article-search');
    const cards = [...blog.querySelectorAll('[data-article]')];
    const normalize = s => s.toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g,'ا');
    const filter = () => {
      const query = normalize(search.value.trim()); let count = 0;
      cards.forEach(card => {
        const show = (category === 'all' || card.dataset.category === category) && normalize(card.dataset.search).includes(query);
        card.hidden = !show; if (show) count++;
      });
      document.getElementById('article-count').textContent = text(`${count} مقالات مطابقة`, `${count} matching articles`);
      document.getElementById('no-articles').hidden = count > 0;
    };
    search.addEventListener('input', filter);
    blog.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
      category = button.dataset.filter;
      blog.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      filter();
    }));
  }

  const form = document.getElementById('lead-form');
  if (!form) return;
  const mode = document.getElementById('submission-mode');
  const submit = document.getElementById('lead-submit');
  const status = document.getElementById('lead-status');
  const whatsapp = document.getElementById('whatsapp-ready');
  const fields = Object.fromEntries(['name','company','phone','email','service','city','sites','startDate','message','consent','website'].map(key => [key, form.elements.namedItem(key)]));
  let serverEnabled = false;
  let pending = false;
  const validServices = [...fields.service.options].map(o => o.value).filter(Boolean);
  const requestedService = new URLSearchParams(location.search).get('service');
  if (validServices.includes(requestedService)) fields.service.value = requestedService;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
  fields.startDate.min = tomorrow;
  const digits = s => String(s).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
  const say = (message, kind = 'info') => {
    status.textContent = message; status.className = `status status-${kind} mt-6`; status.hidden = false; status.focus();
  };
  const read = () => ({
    name: fields.name.value.trim(), company: fields.company.value.trim(), phone: digits(fields.phone.value.trim()),
    email: fields.email.value.trim(), service: fields.service.value, city: fields.city.value.trim(),
    sites: fields.sites.value, startDate: fields.startDate.value, message: fields.message.value.trim(),
    consent: fields.consent.checked, website: fields.website.value, locale: english ? 'en' : 'ar', sourcePage: location.pathname
  });
  const errorsFor = data => {
    const errors = {};
    if (data.name.length < 2 || data.name.length > 100) errors.name = text('أدخل اسمًا من حرفين إلى 100 حرف.', 'Enter a name between 2 and 100 characters.');
    if (data.company.length > 160) errors.company = text('اسم الجهة طويل؛ الحد 160 حرفًا.', 'Organization must be at most 160 characters.');
    if (!/^[+]?[0-9][0-9 ()-]{6,24}$/.test(data.phone) || data.phone.length > 25) errors.phone = text('أدخل رقم هاتف صحيحًا.', 'Enter a valid phone number.');
    if (data.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254)) errors.email = text('أدخل بريدًا إلكترونيًا صحيحًا.', 'Enter a valid email address.');
    if (!validServices.includes(data.service)) errors.service = text('اختر الخدمة المطلوبة.', 'Choose the required service.');
    if (data.city.length > 100) errors.city = text('المدينة يجب ألا تتجاوز 100 حرف.', 'City must be at most 100 characters.');
    if (data.sites && (!/^\d+$/.test(data.sites) || Number(data.sites) < 1 || Number(data.sites) > 1000)) errors.sites = text('أدخل عددًا صحيحًا من 1 إلى 1000.', 'Enter a whole number from 1 to 1000.');
    if (data.startDate && (data.startDate < tomorrow || !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate))) errors.startDate = text('اختر تاريخًا مستقبليًا.', 'Choose a future date.');
    if (data.message.length > 2000) errors.message = text('الحد الأعلى 2000 حرف.', 'Maximum 2000 characters.');
    if (!data.consent) errors.consent = text('تلزم الموافقة على استخدام بيانات الاستفسار.', 'Consent to inquiry data use is required.');
    if (data.website) errors.website = text('تعذر التحقق من الطلب.', 'The request could not be validated.');
    if (new TextEncoder().encode(JSON.stringify(data)).length > 8192) errors.message = text('الطلب كبير؛ اختصر التفاصيل العامة.', 'The request is too large. Shorten the description.');
    return errors;
  };
  const showErrors = errors => {
    form.querySelectorAll('[id$="-error"]').forEach(el => { el.hidden = true; el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    Object.entries(errors).forEach(([key,message]) => {
      const field = form.elements.namedItem(key); const error = document.getElementById(`${key}-error`);
      if (field) field.setAttribute('aria-invalid','true');
      if (error) { error.textContent = message; error.hidden = false; }
    });
    const first = form.elements.namedItem(Object.keys(errors)[0]); if (first) first.focus();
  };
  const prepareWhatsApp = data => {
    const serviceLabel = fields.service.selectedOptions[0].textContent;
    const fullMessage = data.message;
    const shortMessage = fullMessage.length > 500 ? fullMessage.slice(0,500) + '…' : fullMessage;
    const parts = [text('استفسار عبر موقع فرسان الأمن', 'Inquiry from Fursan website'), `${text('الاسم','Name')}: ${data.name}`, `${text('الجهة','Organization')}: ${data.company || '—'}`, `${text('الخدمة','Service')}: ${serviceLabel}`, `${text('رقم الاتصال','Phone')}: ${data.phone}`, `${text('البريد','Email')}: ${data.email || '—'}`, `${text('المدينة','City')}: ${data.city || '—'}`, `${text('عدد المواقع','Sites')}: ${data.sites || '—'}`, `${text('تاريخ البدء','Start date')}: ${data.startDate || '—'}`, `${text('التفاصيل','Details')}: ${shortMessage || '—'}`];
    if (fullMessage.length > 500) parts.push(text('تم اختصار التفاصيل للرسالة؛ سأضيف بقية التفاصيل بعد التواصل.', 'The description was shortened; I will provide the remainder after contact.'));
    whatsapp.href = `https://wa.me/966553338111?text=${encodeURIComponent(parts.join('\n'))}`;
    whatsapp.hidden = false;
    return fullMessage.length > 500;
  };
  form.addEventListener('input', () => { if (!pending) { whatsapp.hidden = true; status.hidden = true; } });
  const configured = fetch('/api/public-config', { headers:{Accept:'application/json'}, signal:AbortSignal.timeout(5000) }).then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
    const settings = await response.json(); serverEnabled = settings.leadSubmissionEnabled === true;
    if (serverEnabled) {
      mode.textContent = text('الإرسال الإلكتروني مفعل. لا يعرض الموقع نجاحًا إلا بعد تأكيد الخادم حفظ الطلب.', 'Online submission is enabled. Success is displayed only after the server confirms storage.');
      submit.textContent = text('إرسال الطلب', 'Submit inquiry');
    }
  }).catch(() => {});
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pending) return;
    const data = read(); const errors = errorsFor(data); showErrors(errors);
    if (Object.keys(errors).length) return;
    pending = true; submit.disabled = true; submit.setAttribute('aria-busy','true'); whatsapp.hidden = true;
    await configured;
    if (!serverEnabled) {
      const shortened = prepareWhatsApp(data);
      say(text('تم تجهيز رسالة التواصل فقط، ولم يُحفظ طلب في قاعدة البيانات. راجعها في واتساب وأرسلها بنفسك.', 'A message is prepared only; no database request has been saved. Review and send it yourself on WhatsApp.') + (shortened ? text(' اختُصرت التفاصيل إلى 500 حرف للرسالة؛ يمكنك إضافة الباقي بعد فتحها.', ' The description was shortened to 500 characters; add the remainder after opening it.') : ''));
    } else {
      try {
        const response = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify(data), signal:AbortSignal.timeout(15000) });
        const result = await response.json();
        if (response.status === 201 && result.status === 'accepted' && typeof result.requestId === 'string') {
          say(text(`استُلم الطلب. رقم المتابعة: ${result.requestId}. لا يمثل ذلك اعتماد عرض أو بدء خدمة.`, `Request received. Reference: ${result.requestId}. This is not an approved proposal or service commencement.`),'success'); form.reset();
        } else if (response.status === 400 && Array.isArray(result.fields)) {
          const generic = Object.fromEntries(result.fields.filter(k => form.elements.namedItem(k)).map(k=>[k,text('راجع هذا الحقل ثم أعد المحاولة.', 'Review this field before trying again.')]));
          say(text('لم يُحفظ الطلب؛ راجع الحقول المشار إليها.', 'The request was not saved. Review the indicated fields.'),'error'); showErrors(generic);
        } else if (response.status === 503 || response.status === 429 || response.status === 403) {
          prepareWhatsApp(data);
          say(text('الإرسال غير متاح حاليًا ولم يؤكد الخادم حفظ الطلب. يمكنك اختيار التواصل عبر واتساب بدلًا من ذلك.', 'Submission is unavailable and the server has not confirmed storage. You may choose WhatsApp instead.'),'error');
        } else {
          say(text('تعذر تأكيد نتيجة الإرسال. قد يكون الطلب وصل؛ لا تعِد الإرسال تلقائيًا. تواصل مع الشركة للتحقق.', 'The submission result could not be confirmed. The request may have arrived; do not automatically retry. Contact the company to check.') + (result.requestId ? ` ${text('مرجع','Reference')}: ${result.requestId}` : ''),'error');
        }
      } catch {
        say(text('تعذر تأكيد نتيجة الإرسال بسبب الاتصال. قد يكون الطلب وصل؛ تحقق مع الشركة قبل إعادة الإرسال.', 'A connection issue prevented confirmation. The request may have arrived; check with the company before resubmitting.'),'error');
      }
    }
    pending = false; submit.disabled = false; submit.removeAttribute('aria-busy');
  });
})();
