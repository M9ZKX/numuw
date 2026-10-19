/*
  services.js
  قائمة الخدمات وطلب خدمة من الصفحة الرئيسية.

  - يقرأ الخدمات المفعّلة من جدول services ويعرضها.
  - يحسب التكلفة = سعر الوحدة × الكمية.
  - يعرض رصيد المحفظة للمستخدم المسجّل.
  - يرسل الطلب عبر الدالة create_order (تخصم من المحفظة على الخادم).
*/

(function () {
  "use strict";

  const H = window.FormHelpers;

  const CATEGORY_ICON = {
    instagram: "instagram",
    tiktok: "tiktok",
    youtube: "youtube",
    facebook: "facebook",
    twitter: "twitter",
    x: "twitter",
    telegram: "telegram",
    whatsapp: "whatsapp",
  };

  const ERROR_TEXT = {
    not_authenticated: "انتهت الجلسة، يرجى تسجيل الدخول من جديد.",
    invalid_quantity: "الكمية غير صحيحة.",
    empty_target: "أدخل رابط الحساب أو المنشور.",
    service_not_found: "الخدمة غير متاحة حاليًا.",
    quantity_out_of_range: "الكمية خارج النطاق المسموح لهذه الخدمة.",
    insufficient_funds: "رصيدك غير كافٍ. اشحن محفظتك ثم أعد المحاولة.",
  };

  let services = [];
  let byId = {};
  let formWired = false;
  let dataLoaded = false;

  function client() {
    return window.SupabaseClient;
  }
  function uid() {
    return window.AppSession && window.AppSession.user
      ? window.AppSession.user.id
      : null;
  }
  function fmt(v) {
    return Number(v || 0)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ——— العرض ——— */
  function renderServices() {
    const list = document.getElementById("services-list");
    const empty = document.getElementById("services-empty");
    const status = document.getElementById("services-status");
    const orderCard = document.getElementById("order-card");
    if (!list) return;

    if (status) status.hidden = true;
    list.innerHTML = "";

    if (!services.length) {
      if (empty) empty.hidden = false;
      if (orderCard) orderCard.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (orderCard) orderCard.hidden = false;

    services.forEach(function (s) {
      const icon = CATEGORY_ICON[String(s.category || "").toLowerCase()] || "sparkles";
      const card = document.createElement("article");
      card.className = "card feature";
      card.setAttribute("data-reveal", "");
      card.classList.add("is-visible");
      card.innerHTML =
        '<span class="icon-badge" data-icon="' + icon + '"></span>' +
        "<h3>" + escapeHtml(s.name) + "</h3>" +
        '<p class="text-muted text-sm">' +
        (s.description ? escapeHtml(s.description) : escapeHtml(s.category || "")) +
        "</p>" +
        '<p class="text-muted text-sm mt-3">السعر: <strong>' +
        fmt(s.rate) +
        "</strong> د.ل للوحدة</p>" +
        '<p class="text-muted text-sm">الكمية: ' +
        s.min_qty +
        (s.max_qty ? " – " + s.max_qty : "+") +
        "</p>" +
        '<button class="btn btn--outline btn--sm mt-4" type="button" data-pick="' +
        s.id +
        '">اختيار الخدمة</button>';
      list.appendChild(card);
    });

    if (window.Icons && window.Icons.hydrateIcons) window.Icons.hydrateIcons(list);

    list.querySelectorAll("[data-pick]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const select = document.getElementById("order-service");
        if (!select) return;
        select.value = btn.getAttribute("data-pick");
        select.dispatchEvent(new Event("change", { bubbles: true }));
        const qty = document.getElementById("order-quantity");
        if (qty) {
          qty.focus();
          qty.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
  }

  function fillSelect() {
    const select = document.getElementById("order-service");
    if (!select) return;
    select.innerHTML = "";
    services.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name + " — " + fmt(s.rate) + " د.ل/وحدة";
      select.appendChild(opt);
    });
    if (services.length) select.value = services[0].id;
    updateForService();
  }

  function currentService() {
    const select = document.getElementById("order-service");
    return select ? byId[select.value] : null;
  }

  function updateForService() {
    const s = currentService();
    const hint = document.getElementById("order-quantity-hint");
    const qty = document.getElementById("order-quantity");
    if (!s) return;

    if (hint) {
      hint.textContent =
        "الحد الأدنى " +
        s.min_qty +
        (s.max_qty ? " والحد الأقصى " + s.max_qty : "") +
        " لهذه الخدمة.";
    }
    if (qty) {
      qty.min = String(s.min_qty);
      if (s.max_qty) qty.max = String(s.max_qty);
      else qty.removeAttribute("max");
      if (!qty.value) qty.value = String(s.min_qty);
    }
    updateCharge();
  }

  function updateCharge() {
    const s = currentService();
    const out = document.getElementById("order-charge");
    const qtyEl = document.getElementById("order-quantity");
    if (!out) return;
    if (!s || !qtyEl || !qtyEl.value) {
      out.textContent = "—";
      return;
    }
    const q = Number(qtyEl.value);
    if (isNaN(q) || q <= 0) {
      out.textContent = "—";
      return;
    }
    out.textContent = fmt(s.rate * q) + " د.ل";
  }

  /* ——— تحميل البيانات ——— */
  async function loadServices() {
    const c = client();
    if (!c) return;
    const { data, error } = await c
      .from("services")
      .select("id, name, category, description, rate, min_qty, max_qty, sort_order")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      const status = document.getElementById("services-status");
      if (status) {
        status.className = "alert alert--danger";
        status.innerHTML =
          '<span data-icon="alert" data-icon-size="20"></span><div><p>تعذّر تحميل الخدمات الآن.</p></div>';
        if (window.Icons) window.Icons.hydrateIcons(status);
      }
      return;
    }

    services = data || [];
    byId = {};
    services.forEach(function (s) {
      byId[String(s.id)] = s;
    });

    renderServices();
    fillSelect();
  }

  async function loadBalance() {
    const c = client();
    const id = uid();
    const out = document.getElementById("order-balance");
    if (!out) return;
    if (!c || !id) {
      out.textContent = "—";
      return;
    }
    const { data, error } = await c
      .from("wallets")
      .select("balance")
      .eq("user_id", id)
      .maybeSingle();
    if (error) return;
    out.textContent = fmt(data ? data.balance : 0) + " د.ل";
  }

  /* ——— الجلسة ——— */
  function applyAuthState() {
    const authed = Boolean(uid());
    const note = document.getElementById("order-auth-note");
    const form = document.getElementById("order-form");
    if (note) note.hidden = authed;
    if (form) {
      form.querySelectorAll("input, select, button").forEach(function (el) {
        if (el.closest("#order-auth-note")) return;
        el.disabled = !authed;
      });
    }
    if (authed) loadBalance();
    else {
      const out = document.getElementById("order-balance");
      if (out) out.textContent = "—";
    }
  }

  /* ——— النموذج ——— */
  function wireForm() {
    if (formWired) return;
    const form = document.getElementById("order-form");
    if (!form) return;
    formWired = true;

    const select = document.getElementById("order-service");
    const qty = document.getElementById("order-quantity");
    const target = document.getElementById("order-target");

    if (select) {
      select.addEventListener("change", function () {
        const qv = document.getElementById("order-quantity");
        if (qv) qv.value = "";
        updateForService();
      });
    }
    if (qty) qty.addEventListener("input", updateCharge);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitOrder();
    });
  }

  function clearErrors() {
    ["order-service", "order-target", "order-quantity"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el && H) H.clearFieldError(el);
    });
  }

  async function submitOrder() {
    const c = client();
    const s = currentService();
    const targetEl = document.getElementById("order-target");
    const qtyEl = document.getElementById("order-quantity");

    clearErrors();

    if (!uid()) {
      window.UI.toast(ERROR_TEXT.not_authenticated, { type: "danger" });
      return;
    }
    if (!s) {
      window.UI.toast("اختر خدمة أولًا.", { type: "warning" });
      return;
    }

    let valid = true;
    const target = (targetEl.value || "").trim();
    if (!target) {
      H.setFieldError(targetEl, "أدخل رابط الحساب أو المنشور.");
      valid = false;
    }
    const q = Number(qtyEl.value);
    if (!qtyEl.value || !Number.isInteger(q) || q <= 0) {
      H.setFieldError(qtyEl, "أدخل كمية صحيحة.");
      valid = false;
    } else if (q < s.min_qty || (s.max_qty && q > s.max_qty)) {
      H.setFieldError(qtyEl, ERROR_TEXT.quantity_out_of_range);
      valid = false;
    }
    if (!valid) {
      window.UI.toast("يرجى تصحيح بيانات الطلب.", { type: "danger" });
      return;
    }

    const btn = document.querySelector('#order-form button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-loading");
    }

    const { data, error } = await c.rpc("create_order", {
      p_service: Number(s.id),
      p_quantity: q,
      p_target: target,
    });

    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }

    if (error) {
      window.UI.toast("تعذّر إرسال الطلب، حاول مرة أخرى.", { type: "danger" });
      return;
    }
    if (!data || data.ok !== true) {
      const code = data && data.error;
      window.UI.toast(ERROR_TEXT[code] || "تعذّر إنشاء الطلب.", {
        type: "warning",
        title: "لم يتم إنشاء الطلب",
      });
      return;
    }

    window.UI.toast(
      "تم إنشاء الطلب بتكلفة " +
        fmt(data.charge) +
        " د.ل. رصيدك المتبقي: " +
        fmt(data.balance) +
        " د.ل.",
      { type: "success", title: "تم إرسال الطلب", duration: 8000 }
    );

    qtyEl.value = "";
    updateCharge();
    loadBalance();
  }

  /* ——— الإقلاع ——— */
  function wireOnce() {
    wireForm();
    applyAuthState();
  }

  function loadOnce() {
    if (dataLoaded) return;
    dataLoaded = true;
    loadServices();
    applyAuthState();
  }

  function showUnavailable() {
    const status = document.getElementById("services-status");
    if (!status) return;
    status.hidden = false;
    status.className = "alert alert--warning";
    status.innerHTML =
      '<span data-icon="alert" data-icon-size="20"></span><div><p>تعذّر الاتصال بقاعدة البيانات لعرض الخدمات.</p></div>';
    if (window.Icons) window.Icons.hydrateIcons(status);
  }

  document.addEventListener("DOMContentLoaded", wireOnce);
  document.addEventListener("supabase:ready", function () {
    wireOnce();
    loadOnce();
  });
  document.addEventListener("supabase:unavailable", function () {
    wireOnce();
    showUnavailable();
  });
  document.addEventListener("session:changed", applyAuthState);
})();
