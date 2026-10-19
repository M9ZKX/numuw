/*
  admin.js
  منطق لوحة الإدارة المربوط بقاعدة البيانات:

  - التحقق من صلاحية المشرف عبر جدول profiles.role.
  - نظرة عامة (عدد المستخدمين/الخدمات/الطلبات/الشحن المعلّق).
  - إدارة المستخدمين وتعديل أرصدتهم (admin_adjust_balance).
  - خدمات (إضافة/تعديل/حذف) — محميّة بسياسات RLS للمشرف.
  - الطلبات (عرض + تغيير الحالة).
  - عمليات الشحن (موافقة/رفض/مراجعة عبر admin_recharge_action).
  - أرقام الاستقبال (إضافة/تعديل/حذف).
*/

(function () {
  "use strict";

  const V = window.Validators;

  const COMPANY_LABEL = { libyana: "ليبيانا", almadar: "المدار" };
  const ORDER_STATUS = {
    pending: "قيد الانتظار",
    processing: "قيد التنفيذ",
    completed: "مكتمل",
    canceled: "ملغى",
    refunded: "مُسترجع",
  };
  const RECHARGE_STATUS = {
    pending: { label: "بانتظار التحقق", cls: "badge--pending" },
    success: { label: "ناجح", cls: "badge--success" },
    failed: { label: "فاشل", cls: "badge--failed" },
    cancelled: { label: "ملغى", cls: "badge--muted" },
    needs_review: { label: "يحتاج إلى مراجعة", cls: "badge--review" },
  };

  let profilesMap = {};
  let servicesMap = {};
  let wired = false;
  let loaded = false;

  /* ——— أدوات ——— */
  function client() {
    return window.SupabaseClient;
  }

  function uid() {
    return window.AppSession && window.AppSession.user
      ? window.AppSession.user.id
      : null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function formatCurrency(value) {
    return Number(value || 0)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes())
    );
  }

  function fail(message) {
    window.UI.toast(message, { type: "danger" });
  }

  function ok(message) {
    window.UI.toast(message, { type: "success" });
  }

  function userEmail(id) {
    const p = profilesMap[id];
    return p ? p.email || p.full_name || id : id;
  }

  /* ——— بوابة الصلاحية ——— */
  function showPanel() {
    const panel = document.getElementById("admin-app");
    const denied = document.getElementById("admin-denied");
    if (panel) panel.hidden = false;
    if (denied) denied.hidden = true;
  }

  function showDenied() {
    const panel = document.getElementById("admin-app");
    const denied = document.getElementById("admin-denied");
    if (panel) panel.hidden = true;
    if (denied) denied.hidden = false;
  }

  async function guard() {
    const c = client();
    const id = uid();
    if (!c || !id) {
      showDenied();
      return;
    }
    const { data, error } = await c
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle();
    if (error || !data || data.role !== "admin") {
      showDenied();
      return;
    }
    showPanel();
    reload();
  }

  /* ——— نظرة عامة ——— */
  async function loadOverview() {
    const c = client();
    if (!c) return;
    const set = function (id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    const [users, services, orders, pending] = await Promise.all([
      c.from("profiles").select("*", { count: "exact", head: true }),
      c.from("services").select("*", { count: "exact", head: true }),
      c.from("orders").select("*", { count: "exact", head: true }),
      c
        .from("recharges")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "needs_review"]),
    ]);

    set("stat-users", users.count == null ? "—" : users.count);
    set("stat-services", services.count == null ? "—" : services.count);
    set("stat-orders", orders.count == null ? "—" : orders.count);
    set("stat-recharges", pending.count == null ? "—" : pending.count);
  }

  /* ——— المستخدمون ——— */
  async function loadUsers() {
    const tbody = document.getElementById("users-body");
    const c = client();
    if (!tbody || !c) return;

    const rows = Object.keys(profilesMap).map(function (k) {
      return profilesMap[k];
    });
    const { data: wallets } = await c.from("wallets").select("user_id, balance");
    const balances = {};
    (wallets || []).forEach(function (w) {
      balances[w.user_id] = w.balance;
    });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">لا يوجد مستخدمون بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (p) {
        const roleCls = p.role === "admin" ? "badge--success" : "badge--muted";
        const roleLabel = p.role === "admin" ? "مشرف" : "مستخدم";
        return (
          '<tr data-id="' + p.id + '">' +
          "<td>" + escapeHtml(p.full_name || "—") + "</td>" +
          '<td dir="ltr">' + escapeHtml(p.email || "—") + "</td>" +
          '<td><span class="badge ' + roleCls + '">' + roleLabel + "</span></td>" +
          "<td>" + formatCurrency(balances[p.id]) + " د.ل</td>" +
          "<td>" +
          '<input class="input js-amount" type="number" step="0.01" dir="ltr" ' +
          'style="max-width:120px;display:inline-block" placeholder="0.00" ' +
          'aria-label="المبلغ" /> ' +
          '<button class="btn btn--outline btn--sm" type="button" data-act="adjust">تطبيق</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function adjustBalance(userId, rawValue) {
    const c = client();
    const amount = Number(rawValue);
    if (!c || !userId || !rawValue || Number.isNaN(amount) || amount === 0) {
      window.UI.toast("أدخل مبلغًا صحيحًا غير صفري.", { type: "warning" });
      return;
    }
    const { data, error } = await c.rpc("admin_adjust_balance", {
      p_user: userId,
      p_amount: amount,
    });
    if (error || (data && data.ok === false)) {
      fail("تعذّر تعديل الرصيد.");
      return;
    }
    ok("تم تحديث الرصيد.");
    reload();
  }

  /* ——— الخدمات ——— */
  async function loadServices() {
    const tbody = document.getElementById("services-body");
    const c = client();
    if (!tbody || !c) return;

    const { data, error } = await c
      .from("services")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      tbody.innerHTML = '<tr><td colspan="7">تعذّر تحميل الخدمات.</td></tr>';
      return;
    }

    servicesMap = {};
    const rows = data || [];
    rows.forEach(function (s) {
      servicesMap[s.id] = s;
    });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">لا توجد خدمات بعد. أضف أول خدمة من الأعلى.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (s) {
        return (
          '<tr data-id="' + s.id + '">' +
          "<td>" + escapeHtml(s.name) + "</td>" +
          '<td dir="ltr">' + escapeHtml(s.category || "—") + "</td>" +
          '<td><input class="input js-rate" type="number" step="0.0001" min="0" dir="ltr" ' +
          'style="max-width:110px" value="' + s.rate + '" /></td>' +
          '<td><input class="input js-min" type="number" step="1" min="1" dir="ltr" ' +
          'style="max-width:100px" value="' + s.min_qty + '" /></td>' +
          '<td><input class="input js-max" type="number" step="1" min="1" dir="ltr" ' +
          'style="max-width:100px" value="' + (s.max_qty == null ? "" : s.max_qty) + '" /></td>' +
          '<td><input type="checkbox" class="js-active" ' + (s.is_active ? "checked" : "") + " /></td>" +
          "<td>" +
          '<button class="btn btn--outline btn--sm" type="button" data-act="save-service">حفظ</button> ' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="del-service">حذف</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function addService(form) {
    const c = client();
    const name = document.getElementById("svc-name").value.trim();
    const category = document.getElementById("svc-category").value.trim();
    const description = document.getElementById("svc-desc").value.trim();
    const rate = Number(document.getElementById("svc-rate").value);
    const min = Number(document.getElementById("svc-min").value);
    const maxRaw = document.getElementById("svc-max").value.trim();
    const max = maxRaw === "" ? null : Number(maxRaw);

    if (!name || !category || !(rate >= 0) || !(min > 0)) {
      window.UI.toast("يرجى إكمال بيانات الخدمة المطلوبة.", { type: "warning" });
      return;
    }
    if (max !== null && max < min) {
      window.UI.toast("أقصى كمية يجب أن يكون أكبر من أو يساوي أقل كمية.", {
        type: "warning",
      });
      return;
    }

    const { error } = await c.from("services").insert({
      name: name,
      category: category,
      description: description || null,
      rate: rate,
      min_qty: min,
      max_qty: max,
      is_active: true,
    });
    if (error) {
      fail("تعذّر إضافة الخدمة.");
      return;
    }
    form.reset();
    ok("تمت إضافة الخدمة.");
    reload();
  }

  async function saveService(id, row) {
    const c = client();
    const maxRaw = row.querySelector(".js-max").value.trim();
    const patch = {
      rate: Number(row.querySelector(".js-rate").value),
      min_qty: Number(row.querySelector(".js-min").value),
      max_qty: maxRaw === "" ? null : Number(maxRaw),
      is_active: row.querySelector(".js-active").checked,
    };
    const { error } = await c.from("services").update(patch).eq("id", id);
    if (error) {
      fail("تعذّر حفظ الخدمة.");
      return;
    }
    ok("تم حفظ الخدمة.");
    reload();
  }

  async function deleteService(id) {
    if (!window.confirm("حذف هذه الخدمة نهائيًا؟")) return;
    const { error } = await client().from("services").delete().eq("id", id);
    if (error) {
      fail("تعذّر حذف الخدمة.");
      return;
    }
    ok("تم حذف الخدمة.");
    reload();
  }

  /* ——— الطلبات ——— */
  async function loadOrders() {
    const tbody = document.getElementById("orders-body");
    const c = client();
    if (!tbody || !c) return;

    const { data, error } = await c
      .from("orders")
      .select("id, user_id, service_id, quantity, charge, status, target, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      tbody.innerHTML = '<tr><td colspan="7">تعذّر تحميل الطلبات.</td></tr>';
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">لا توجد طلبات بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (o) {
        const svc = servicesMap[o.service_id];
        const options = Object.keys(ORDER_STATUS)
          .map(function (key) {
            return (
              '<option value="' + key + '"' +
              (o.status === key ? " selected" : "") + ">" +
              ORDER_STATUS[key] + "</option>"
            );
          })
          .join("");
        return (
          '<tr data-id="' + o.id + '">' +
          "<td>" + o.id + "</td>" +
          "<td>" + escapeHtml(userEmail(o.user_id)) + "</td>" +
          "<td>" + escapeHtml(svc ? svc.name : "—") + "</td>" +
          "<td>" + o.quantity + "</td>" +
          "<td>" + formatCurrency(o.charge) + "</td>" +
          '<td dir="ltr" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">' +
          escapeHtml(o.target) + "</td>" +
          '<td><select class="select js-order-status">' + options + "</select></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function updateOrderStatus(id, status) {
    const { error } = await client().from("orders").update({ status: status }).eq("id", id);
    if (error) {
      fail("تعذّر تحديث حالة الطلب.");
      return;
    }
    ok("تم تحديث حالة الطلب.");
    loadOverview();
  }

  /* ——— عمليات الشحن ——— */
  async function loadRecharges() {
    const tbody = document.getElementById("recharges-body");
    const c = client();
    if (!tbody || !c) return;

    const { data, error } = await c
      .from("recharges")
      .select("id, user_id, company, sender_phone, amount, status, credited, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      tbody.innerHTML = '<tr><td colspan="8">تعذّر تحميل عمليات الشحن.</td></tr>';
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8">لا توجد عمليات شحن بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (r) {
        const meta = RECHARGE_STATUS[r.status] || { label: r.status, cls: "badge--muted" };
        const credited = r.credited
          ? '<span class="badge badge--success">نعم</span>'
          : '<span class="badge badge--muted">لا</span>';
        const disabled = r.credited ? " disabled" : "";
        return (
          '<tr data-id="' + r.id + '">' +
          "<td>" + r.id + "</td>" +
          "<td>" + escapeHtml(userEmail(r.user_id)) + "</td>" +
          "<td>" + (COMPANY_LABEL[r.company] || r.company) + "</td>" +
          '<td dir="ltr">' + escapeHtml(r.sender_phone) + "</td>" +
          "<td>" + formatCurrency(r.amount) + "</td>" +
          '<td><span class="badge ' + meta.cls + '">' + meta.label + "</span></td>" +
          "<td>" + credited + "</td>" +
          "<td>" +
          '<button class="btn btn--primary btn--sm" type="button" data-act="approve"' + disabled + ">اعتماد</button> " +
          '<button class="btn btn--outline btn--sm" type="button" data-act="review"' + disabled + ">مراجعة</button> " +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="reject"' + disabled + ">رفض</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function rechargeAction(id, action) {
    const { data, error } = await client().rpc("admin_recharge_action", {
      p_id: Number(id),
      p_action: action,
    });
    if (error || (data && data.ok === false)) {
      fail("تعذّر تنفيذ العملية.");
      return;
    }
    ok("تم تحديث عملية الشحن.");
    reload();
  }

  /* ——— أرقام الاستقبال ——— */
  async function loadReceivers() {
    const tbody = document.getElementById("receivers-body");
    const c = client();
    if (!tbody || !c) return;

    const { data, error } = await c
      .from("wallet_receivers")
      .select("id, company, phone, is_active, sort_order")
      .order("company", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      tbody.innerHTML = '<tr><td colspan="5">تعذّر تحميل الأرقام.</td></tr>';
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">لا توجد أرقام استقبال بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (r) {
        return (
          '<tr data-id="' + r.id + '">' +
          "<td>" + (COMPANY_LABEL[r.company] || r.company) + "</td>" +
          '<td><input class="input js-phone" type="tel" dir="ltr" style="max-width:150px" ' +
          'value="' + escapeHtml(r.phone) + '" /></td>' +
          '<td><input class="input js-sort" type="number" step="1" dir="ltr" ' +
          'style="max-width:90px" value="' + (r.sort_order == null ? 0 : r.sort_order) + '" /></td>' +
          '<td><input type="checkbox" class="js-active" ' + (r.is_active ? "checked" : "") + " /></td>" +
          "<td>" +
          '<button class="btn btn--outline btn--sm" type="button" data-act="save-receiver">حفظ</button> ' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="del-receiver">حذف</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function addReceiver(form) {
    const c = client();
    const company = document.getElementById("rcv-company").value;
    const phone = document.getElementById("rcv-phone").value.trim();
    if (window.Validators.lyPhone(phone) !== true) {
      window.UI.toast("أدخل رقمًا ليبيًا صحيحًا يبدأ بـ 09 (10 أرقام).", {
        type: "warning",
      });
      return;
    }
    const { error } = await c.from("wallet_receivers").insert({
      company: company,
      phone: phone,
      is_active: true,
      sort_order: 0,
    });
    if (error) {
      fail("تعذّر إضافة الرقم.");
      return;
    }
    form.reset();
    ok("تمت إضافة رقم الاستقبال.");
    reload();
  }

  async function saveReceiver(id, row) {
    const c = client();
    const phone = row.querySelector(".js-phone").value.trim();
    if (window.Validators.lyPhone(phone) !== true) {
      window.UI.toast("رقم غير صحيح.", { type: "warning" });
      return;
    }
    const patch = {
      phone: phone,
      sort_order: Number(row.querySelector(".js-sort").value) || 0,
      is_active: row.querySelector(".js-active").checked,
    };
    const { error } = await c.from("wallet_receivers").update(patch).eq("id", id);
    if (error) {
      fail("تعذّر حفظ الرقم.");
      return;
    }
    ok("تم حفظ الرقم.");
    reload();
  }

  async function deleteReceiver(id) {
    if (!window.confirm("حذف رقم الاستقبال هذا؟")) return;
    const { error } = await client().from("wallet_receivers").delete().eq("id", id);
    if (error) {
      fail("تعذّر حذف الرقم.");
      return;
    }
    ok("تم حذف الرقم.");
    reload();
  }

  /* ——— تحميل شامل ——— */
  async function reload() {
    const c = client();
    if (!c) return;

    const { data } = await c
      .from("profiles")
      .select("id, email, full_name, role")
      .order("created_at", { ascending: false });
    profilesMap = {};
    (data || []).forEach(function (p) {
      profilesMap[p.id] = p;
    });

    await Promise.all([
      loadOverview(),
      loadUsers(),
      loadServices().then(loadOrders),
      loadRecharges(),
      loadReceivers(),
    ]);
  }

  /* ——— الربط ——— */
  function wireOnce() {
    if (wired) return;
    wired = true;

    const serviceForm = document.getElementById("service-form");
    if (serviceForm) {
      serviceForm.addEventListener("submit", function (e) {
        e.preventDefault();
        addService(serviceForm);
      });
    }

    const receiverForm = document.getElementById("receiver-form");
    if (receiverForm) {
      receiverForm.addEventListener("submit", function (e) {
        e.preventDefault();
        addReceiver(receiverForm);
      });
    }

    const reloadBtn = document.getElementById("reload-all");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", reload);
    }

    const usersBody = document.getElementById("users-body");
    if (usersBody) {
      usersBody.addEventListener("click", function (e) {
        const btn = e.target.closest('[data-act="adjust"]');
        if (!btn) return;
        const row = btn.closest("tr");
        adjustBalance(row.getAttribute("data-id"), row.querySelector(".js-amount").value);
      });
    }

    const servicesBody = document.getElementById("services-body");
    if (servicesBody) {
      servicesBody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const row = btn.closest("tr");
        const id = Number(row.getAttribute("data-id"));
        if (btn.getAttribute("data-act") === "save-service") saveService(id, row);
        else if (btn.getAttribute("data-act") === "del-service") deleteService(id);
      });
    }

    const ordersBody = document.getElementById("orders-body");
    if (ordersBody) {
      ordersBody.addEventListener("change", function (e) {
        const sel = e.target.closest(".js-order-status");
        if (!sel) return;
        const row = sel.closest("tr");
        updateOrderStatus(Number(row.getAttribute("data-id")), sel.value);
      });
    }

    const rechargesBody = document.getElementById("recharges-body");
    if (rechargesBody) {
      rechargesBody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-act]");
        if (!btn || btn.disabled) return;
        const row = btn.closest("tr");
        const map = { approve: "approve", review: "review", reject: "reject" };
        const act = map[btn.getAttribute("data-act")];
        if (act) rechargeAction(Number(row.getAttribute("data-id")), act);
      });
    }

    const receiversBody = document.getElementById("receivers-body");
    if (receiversBody) {
      receiversBody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const row = btn.closest("tr");
        const id = Number(row.getAttribute("data-id"));
        if (btn.getAttribute("data-act") === "save-receiver") saveReceiver(id, row);
        else if (btn.getAttribute("data-act") === "del-receiver") deleteReceiver(id);
      });
    }
  }

  function loadOnce() {
    if (loaded) return;
    loaded = true;
    guard();
  }

  document.addEventListener("supabase:ready", function () {
    wireOnce();
    loadOnce();
  });

  document.addEventListener("supabase:unavailable", function () {
    wireOnce();
    showDenied();
    window.UI.toast("تعذّر الاتصال بقاعدة البيانات.", { type: "warning" });
  });

  document.addEventListener("DOMContentLoaded", function () {
    wireOnce();
    loadOnce();
  });

  document.addEventListener("session:changed", function () {
    loaded = false;
    loadOnce();
  });
})();
