/*
  admin.js
  نواة منطقة الإدارة:
  - بناء الشريط الجانبي والشريط العلوي (لتقليل التكرار بين الصفحات).
  - بوابة صلاحية: تتطلّب جلسة ودور admin، وإلا تعيد التوجيه.
  - وحدات لكل صفحة تُختار عبر data-page على <body>.
*/

(function () {
  "use strict";

  const NAV = [
    { key: "dashboard", label: "نظرة عامة", file: "index.html", icon: "chart" },
    { key: "users", label: "المستخدمون", file: "users.html", icon: "user" },
    { key: "providers", label: "المزوّدون", file: "providers.html", icon: "grid" },
    { key: "services", label: "الخدمات", file: "services.html", icon: "sparkles" },
    { key: "orders", label: "الطلبات", file: "orders.html", icon: "bolt" },
    { key: "recharges", label: "الاستلامات", file: "recharges.html", icon: "wallet" },
    { key: "smsraed", label: "ربط SMS RAEED", file: "smsraed.html", icon: "globe" },
    { key: "settings", label: "الإعدادات", file: "settings.html", icon: "settings" },
  ];

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
    needs_review: { label: "يحتاج مراجعة", cls: "badge--review" },
  };

  const profilesMap = {};
  let servicesMap = {};
  let sideBuilt = false;
  let started = false;

  /* ——— أدوات ——— */
  function client() {
    return window.SupabaseClient;
  }
  function el(id) {
    return document.getElementById(id);
  }
  function uid() {
    return window.AppSession && window.AppSession.user
      ? window.AppSession.user.id
      : null;
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(value) {
    return Number(value || 0)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes())
    );
  }
  function fail(msg) {
    window.UI.toast(msg, { type: "danger" });
  }
  function ok(msg) {
    window.UI.toast(msg, { type: "success" });
  }
  function soon(msg) {
    window.UI.toast(msg || "هذه الميزة ستُفعّل قريبًا.", {
      type: "info",
      title: "قريبًا",
    });
  }
  function userEmail(id) {
    const p = profilesMap[id];
    return p ? p.email || p.full_name || id : id;
  }
  function pageKey() {
    return document.body.getAttribute("data-page") || "dashboard";
  }

  /* ——— الهيكل ——— */
  function buildShell() {
    const side = el("admin-side");
    if (side && !sideBuilt) {
      sideBuilt = true;
      const brand = document.createElement("a");
      brand.className = "admin__brand";
      brand.href = "../index.html";
      brand.innerHTML =
        '<img src="../assets/logo.svg" alt="" />' +
        '<span class="admin__unit"><strong>منصة نمو</strong><small>ADMIN</small></span>';
      side.appendChild(brand);

      const nav = document.createElement("nav");
      nav.className = "admin__nav";
      const key = pageKey();
      NAV.forEach(function (item) {
        const a = document.createElement("a");
        a.href = item.file;
        if (item.key === key) a.className = "is-active";
        const icon = document.createElement("span");
        icon.setAttribute("data-icon", item.icon);
        icon.setAttribute("data-icon-size", "18");
        const label = document.createElement("span");
        label.textContent = item.label;
        a.appendChild(icon);
        a.appendChild(label);
        nav.appendChild(a);
      });
      side.appendChild(nav);
      if (window.Icons && window.Icons.hydrateIcons) window.Icons.hydrateIcons(side);
    }

    const top = el("admin-top");
    if (top) {
      top.innerHTML = "";
      const current = NAV.filter(function (n) { return n.key === pageKey(); })[0];
      const h1 = document.createElement("h1");
      h1.textContent = current ? current.label : "لوحة الإدارة";
      top.appendChild(h1);

      const box = document.createElement("div");
      box.className = "admin__user";

      const themeBtn = document.createElement("button");
      themeBtn.className = "btn btn--outline btn--sm";
      themeBtn.type = "button";
      themeBtn.setAttribute("aria-label", "تبديل الوضع الداكن");
      function syncThemeIcon() {
        const dark = document.documentElement.getAttribute("data-theme") !== "light";
        themeBtn.innerHTML = "";
        const icon = window.Icons && window.Icons.createIcon(dark ? "sun" : "moon", 16);
        if (icon) themeBtn.appendChild(icon);
        else themeBtn.textContent = dark ? "☀" : "☾";
      }
      themeBtn.addEventListener("click", function () {
        const dark = document.documentElement.getAttribute("data-theme") !== "light";
        const next = dark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("numuw-admin-theme", next); } catch (e) {}
        syncThemeIcon();
      });
      syncThemeIcon();
      box.appendChild(themeBtn);

      const user = window.AppSession && window.AppSession.user;
      const who = document.createElement("span");
      who.textContent =
        window.AppAuth && user ? window.AppAuth.displayName(user) : "—";
      const out = document.createElement("button");
      out.className = "btn btn--outline btn--sm";
      out.type = "button";
      out.textContent = "خروج";
      out.addEventListener("click", function () {
        if (window.AppAuth) window.AppAuth.signOut();
      });
      box.appendChild(who);
      box.appendChild(out);
      top.appendChild(box);
    }
  }

  /* ——— بوابة الصلاحية ——— */
  function guard() {
    return new Promise(function (resolve) {
      const c = client();
      const session = window.AppSession && window.AppSession.session;
      function denyUser() {
        location.replace("../wallet.html");
      }
      if (!session) {
        location.replace("../login.html");
        resolve(false);
        return;
      }
      const role = window.AppSession.role;
      if (role) {
        if (role !== "admin") { denyUser(); resolve(false); return; }
        resolve(true);
        return;
      }
      c.from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(function (res) {
          const r = res && res.data ? res.data.role : null;
          window.AppSession.role = r;
          if (r !== "admin") { denyUser(); resolve(false); return; }
          resolve(true);
        })
        .catch(function () {
          denyUser();
          resolve(false);
        });
    });
  }

  /* ——— نظرة عامة ——— */
  function dashboard() {
    const c = client();
    const set = function (id, value) {
      const node = el(id);
      if (node) node.textContent = value;
    };
    Promise.all([
      c.from("profiles").select("*", { count: "exact", head: true }),
      c.from("providers").select("*", { count: "exact", head: true }),
      c.from("services").select("*", { count: "exact", head: true }),
      c.from("orders").select("*", { count: "exact", head: true }),
      c.from("recharges").select("*", { count: "exact", head: true }).in("status", ["pending", "needs_review"]),
    ]).then(function (r) {
      set("stat-users", r[0].count == null ? "—" : r[0].count);
      set("stat-providers", r[1].count == null ? "—" : r[1].count);
      set("stat-services", r[2].count == null ? "—" : r[2].count);
      set("stat-orders", r[3].count == null ? "—" : r[3].count);
      set("stat-recharges", r[4].count == null ? "—" : r[4].count);
    });

    const body = el("recent-orders-body");
    if (body) {
      c.from("orders")
        .select("id, user_id, service_id, quantity, charge, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8)
        .then(function (res) {
          const rows = (res && res.data) || [];
          if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5">لا توجد طلبات بعد.</td></tr>';
            return;
          }
          body.innerHTML = rows
            .map(function (o) {
              const meta = ORDER_STATUS[o.status] || o.status;
              return (
                "<tr>" +
                "<td>" + o.id + "</td>" +
                "<td>" + escapeHtml(userEmail(o.user_id)) + "</td>" +
                "<td>" + o.quantity + "</td>" +
                "<td>" + fmt(o.charge) + "</td>" +
                "<td>" + escapeHtml(meta) + "</td>" +
                "</tr>"
              );
            })
            .join("");
        });
    }
  }

  /* ——— المستخدمون ——— */
  function users() {
    const c = client();
    const tbody = el("users-body");
    if (!tbody) return;

    c.from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false })
      .then(function (pRes) {
        const rows = (pRes && pRes.data) || [];
        return c.from("wallets").select("user_id, balance").then(function (wRes) {
          const balances = {};
          ((wRes && wRes.data) || []).forEach(function (w) {
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
                "<td>" + fmt(balances[p.id]) + " د.ل</td>" +
                "<td>" +
                '<input class="input js-amount" type="number" step="0.01" dir="ltr" style="max-width:110px;display:inline-block" placeholder="0.00" aria-label="المبلغ" /> ' +
                '<button class="btn btn--outline btn--sm" type="button" data-act="adjust">تطبيق</button>' +
                "</td>" +
                "</tr>"
              );
            })
            .join("");
        });
      });
  }

  function adjustBalance(userId, raw) {
    const amount = Number(raw);
    if (!raw || isNaN(amount) || amount === 0) {
      window.UI.toast("أدخل مبلغًا صحيحًا غير صفري.", { type: "warning" });
      return;
    }
    client()
      .rpc("admin_adjust_balance", { p_user: userId, p_amount: amount })
      .then(function (res) {
        if (res.error || (res.data && res.data.ok === false)) {
          fail("تعذّر تعديل الرصيد.");
          return;
        }
        ok("تم تحديث الرصيد.");
        users();
      });
  }

  /* ——— المزوّدون ——— */
  function providers() {
    const c = client();
    const tbody = el("providers-body");
    if (!tbody) return;
    c.from("providers")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .then(function (res) {
        if (res.error) {
          tbody.innerHTML = '<tr><td colspan="5">تعذّر تحميل المزوّدين.</td></tr>';
          return;
        }
        const rows = res.data || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5">لا يوجد مزوّدون بعد. أضف أول مزوّد من الأعلى.</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (p) {
            return (
              '<tr data-id="' + p.id + '">' +
              '<td><input class="input js-name" type="text" value="' + escapeHtml(p.name) + '" style="max-width:160px" /></td>' +
              '<td><input class="input js-url" type="url" dir="ltr" value="' + escapeHtml(p.api_url || "") + '" style="max-width:220px" placeholder="https://..." /></td>' +
              '<td><input class="input js-key" type="password" dir="ltr" value="' + escapeHtml(p.api_key || "") + '" style="max-width:180px" placeholder="API key" autocomplete="off" /></td>' +
              "<td>" + fmt(p.balance) + "</td>" +
              '<td><input type="checkbox" class="js-active" ' + (p.is_active ? "checked" : "") + " /></td>" +
              "<td>" +
              '<button class="btn btn--outline btn--sm" type="button" data-act="save-provider">حفظ</button> ' +
              '<button class="btn btn--ghost btn--sm" type="button" data-act="del-provider">حذف</button>' +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      });
  }

  function addProvider(form) {
    const name = el("prov-name").value.trim();
    const url = el("prov-url").value.trim();
    const key = el("prov-key").value.trim();
    if (!name) {
      window.UI.toast("أدخل اسم المزوّد.", { type: "warning" });
      return;
    }
    client()
      .from("providers")
      .insert({ name: name, api_url: url || null, api_key: key || null, is_active: true })
      .then(function (res) {
        if (res.error) { fail("تعذّر إضافة المزوّد."); return; }
        form.reset();
        ok("تمت إضافة المزوّد.");
        providers();
      });
  }

  function saveProvider(id, row) {
    const patch = {
      name: row.querySelector(".js-name").value.trim(),
      api_url: row.querySelector(".js-url").value.trim() || null,
      api_key: row.querySelector(".js-key").value.trim() || null,
      is_active: row.querySelector(".js-active").checked,
    };
    if (!patch.name) { window.UI.toast("اسم المزوّد مطلوب.", { type: "warning" }); return; }
    client()
      .from("providers")
      .update(patch)
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حفظ المزوّد."); return; }
        ok("تم حفظ المزوّد.");
      });
  }

  function deleteProvider(id) {
    if (!window.confirm("حذف هذا المزوّد؟")) return;
    client()
      .from("providers")
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حذف المزوّد."); return; }
        ok("تم حذف المزوّد.");
        providers();
      });
  }

  /* ——— الخدمات ——— */
  const SERVICES_PAGE_SIZE = 50;
  let servicesPage = 1;
  let servicesTotal = 0;
  let servicesCategoriesLoaded = false;

  function servicesState() {
    return {
      search: (el("services-search") && el("services-search").value.trim()) || "",
      category: (el("services-category") && el("services-category").value) || "",
      provider: (el("services-provider") && el("services-provider").value) || "",
      status: (el("services-status") && el("services-status").value) || "",
    };
  }

  function escapeLike(value) {
    return value.replace(/[%_,]/g, function (c) { return "\\" + c; });
  }

  function buildServicesQuery(c, state) {
    let q = c.from("services").select("*", { count: "exact" });
    if (state.search) q = q.ilike("name", "%" + escapeLike(state.search) + "%");
    if (state.category) q = q.eq("category", state.category);
    if (state.provider) q = q.eq("provider_id", Number(state.provider));
    if (state.status === "active") q = q.eq("is_active", true);
    else if (state.status === "inactive") q = q.eq("is_active", false);
    return q;
  }

  function services() {
    const c = client();
    const tbody = el("services-body");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">جارٍ التحميل…</td></tr>';
    const state = servicesState();
    const from = (servicesPage - 1) * SERVICES_PAGE_SIZE;
    const to = from + SERVICES_PAGE_SIZE - 1;

    Promise.all([
      buildServicesQuery(c, state)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
      c.from("providers").select("id, name"),
    ]).then(function (r) {
      const provName = {};
      ((r[1] && r[1].data) || []).forEach(function (p) { provName[p.id] = p.name; });

      if (r[0] && r[0].error) {
        tbody.innerHTML = '<tr><td colspan="7">تعذّر تحميل الخدمات.</td></tr>';
        return;
      }
      const rows = (r[0] && r[0].data) || [];
      servicesTotal = (r[0] && typeof r[0].count === "number") ? r[0].count : rows.length;
      servicesMap = {};
      rows.forEach(function (s) { servicesMap[s.id] = s; });

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7">لا توجد خدمات مطابقة. جرّب تعديل الفلاتر أو ابدأ المزامنة.</td></tr>';
      } else {
        tbody.innerHTML = rows
          .map(function (s) {
            const provider = s.provider_id ? (provName[s.provider_id] || "—") : "—";
            return (
              '<tr data-id="' + s.id + '">' +
              "<td>" + escapeHtml(s.name) + "</td>" +
              '<td dir="ltr">' + escapeHtml(s.category || "—") + "</td>" +
              "<td>" + escapeHtml(provider) + "</td>" +
              '<td><input class="input js-rate" type="number" step="0.0001" min="0" dir="ltr" style="max-width:110px" value="' + s.rate + '" /></td>' +
              '<td><input class="input js-markup" type="number" step="0.01" dir="ltr" style="max-width:90px" value="' + (s.markup == null ? 0 : s.markup) + '" /></td>' +
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
      renderServicesPager();
    });
  }

  function renderServicesPager() {
    const pager = el("services-pager");
    const countLabel = el("services-count");
    const pages = Math.max(1, Math.ceil(servicesTotal / SERVICES_PAGE_SIZE));
    if (servicesPage > pages) servicesPage = pages;
    if (countLabel) {
      countLabel.textContent = "إجمالي النتائج: " + servicesTotal.toLocaleString("en-US") +
        " — صفحة " + servicesPage + " من " + pages;
    }
    if (!pager) return;
    const prev = servicesPage > 1;
    const next = servicesPage < pages;
    pager.innerHTML =
      '<button class="btn btn--outline btn--sm" type="button" data-page="prev"' + (prev ? "" : " disabled") + ">السابق</button>" +
      '<span class="pager__label">صفحة ' + servicesPage + " / " + pages + "</span>" +
      '<button class="btn btn--outline btn--sm" type="button" data-page="next"' + (next ? "" : " disabled") + ">التالي</button>";
  }

  function loadServiceCategoryOptions() {
    if (servicesCategoriesLoaded) return;
    const sel = el("services-category");
    if (!sel) return;
    servicesCategoriesLoaded = true;
    client()
      .rpc("service_categories")
      .then(function (res) {
        const rows = (res && res.data) || [];
        if (!rows.length) { servicesCategoriesLoaded = false; return; }
        const frag = document.createDocumentFragment();
        rows.forEach(function (r) {
          const name = typeof r === "string" ? r : (r.category || r.name);
          if (!name) return;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          frag.appendChild(opt);
        });
        sel.appendChild(frag);
      })
      .catch(function () { servicesCategoriesLoaded = false; });
  }

  function loadServiceProviderOptions() {
    const sel = el("services-provider");
    if (!sel) return;
    client()
      .from("providers")
      .select("id, name")
      .order("name", { ascending: true })
      .then(function (res) {
        const rows = (res && res.data) || [];
        const frag = document.createDocumentFragment();
        rows.forEach(function (p) {
          const opt = document.createElement("option");
          opt.value = String(p.id);
          opt.textContent = p.name;
          frag.appendChild(opt);
        });
        sel.appendChild(frag);
      });
  }

  function wireServicesFilters() {
    const search = el("services-search");
    const category = el("services-category");
    const provider = el("services-provider");
    const status = el("services-status");
    const reset = el("services-reset");
    const pager = el("services-pager");
    let debounce = null;
    if (search) {
      search.addEventListener("input", function () {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(function () { servicesPage = 1; services(); }, 350);
      });
    }
    [category, provider, status].forEach(function (sel) {
      if (sel) sel.addEventListener("change", function () { servicesPage = 1; services(); });
    });
    if (reset) {
      reset.addEventListener("click", function () {
        if (search) search.value = "";
        if (category) category.value = "";
        if (provider) provider.value = "";
        if (status) status.value = "";
        servicesPage = 1;
        services();
      });
    }
    if (pager) {
      pager.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-page]");
        if (!btn || btn.disabled) return;
        if (btn.getAttribute("data-page") === "prev" && servicesPage > 1) servicesPage--;
        else if (btn.getAttribute("data-page") === "next") servicesPage++;
        services();
      });
    }
  }


  function saveService(id, row) {
    const patch = {
      rate: Number(row.querySelector(".js-rate").value),
      markup: Number(row.querySelector(".js-markup").value) || 0,
      is_active: row.querySelector(".js-active").checked,
    };
    client()
      .from("services")
      .update(patch)
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حفظ الخدمة."); return; }
        ok("تم حفظ الخدمة.");
      });
  }

  function deleteService(id) {
    if (!window.confirm("حذف هذه الخدمة؟")) return;
    client()
      .from("services")
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حذف الخدمة."); return; }
        ok("تم حذف الخدمة.");
        services();
      });
  }

  function syncServices(btn, providerId) {
    const c = client();
    if (!c) { fail("الاتصال غير جاهز."); return; }
    const original = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "جارٍ المزامنة…";
    }
    function restore() {
      if (!btn) return;
      btn.disabled = false;
      btn.innerHTML = original;
      if (window.Icons && window.Icons.hydrateIcons) window.Icons.hydrateIcons(btn);
    }
    const payload = providerId ? { provider_id: providerId } : {};
    c.functions
      .invoke("sync-services", { body: payload })
      .then(function (res) {
        if (res.error) { fail("تعذّرت المزامنة. تأكّد من رابط الـAPI والمفتاح."); return; }
        const data = res.data || {};
        const results = Array.isArray(data.results) ? data.results : [];
        const bad = results.filter(function (r) { return !r.ok; })[0];
        if (!data.ok) {
          fail(bad ? "تعذّرت المزامنة: " + (bad.error || "خطأ") : "تعذّرت المزامنة.");
          return;
        }
        let inserted = 0;
        let updated = 0;
        results.forEach(function (r) {
          inserted += r.inserted || 0;
          updated += r.updated || 0;
        });
        ok("تمت المزامنة: " + inserted + " خدمة جديدة، " + updated + " محدّثة.");
        if (pageKey() === "services") services();
      })
      .catch(function () {
        fail("تعذّرت المزامنة. تحقّق من الاتصال.");
      })
      .then(restore);
  }

  /* ——— الطلبات ——— */
  function orders() {
    const c = client();
    const tbody = el("orders-body");
    if (!tbody) return;
    c.from("orders")
      .select("id, user_id, service_id, quantity, charge, status, target, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(function (res) {
        const rows = (res && res.data) || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7">لا توجد طلبات بعد.</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (o) {
            const svc = servicesMap[o.service_id];
            const options = Object.keys(ORDER_STATUS)
              .map(function (k) {
                return '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + ORDER_STATUS[k] + "</option>";
              })
              .join("");
            return (
              '<tr data-id="' + o.id + '">' +
              "<td>" + o.id + "</td>" +
              "<td>" + escapeHtml(userEmail(o.user_id)) + "</td>" +
              "<td>" + escapeHtml(svc ? svc.name : "—") + "</td>" +
              "<td>" + o.quantity + "</td>" +
              "<td>" + fmt(o.charge) + "</td>" +
              '<td dir="ltr" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(o.target) + "</td>" +
              '<td><select class="select js-order-status">' +
              Object.keys(ORDER_STATUS).map(function (k) {
                return '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + ORDER_STATUS[k] + "</option>";
              }).join("") +
              "</select></td>" +
              "</tr>"
            );
          })
          .join("");
      });
  }

  function updateOrderStatus(id, status) {
    client()
      .from("orders")
      .update({ status: status })
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر تحديث حالة الطلب."); return; }
        ok("تم تحديث حالة الطلب.");
      });
  }

  /* ——— الاستلامات (recharges) ——— */
  function recharges() {
    const c = client();
    const tbody = el("recharges-body");
    if (!tbody) return;
    c.from("recharges")
      .select("id, user_id, company, sender_phone, amount, status, credited, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(function (res) {
        if (res.error) {
          tbody.innerHTML = '<tr><td colspan="8">تعذّر تحميل الاستلامات.</td></tr>';
          return;
        }
        const rows = res.data || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="8">لا توجد استلامات بعد.</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (r) {
            const meta = RECHARGE_STATUS[r.status] || { label: r.status, cls: "badge--muted" };
            const credited = r.credited
              ? '<span class="badge badge--success">نعم</span>'
              : '<span class="badge badge--muted">لا</span>';
            const dis = r.credited ? " disabled" : "";
            return (
              '<tr data-id="' + r.id + '">' +
              "<td>" + r.id + "</td>" +
              "<td>" + escapeHtml(userEmail(r.user_id)) + "</td>" +
              "<td>" + (COMPANY_LABEL[r.company] || r.company) + "</td>" +
              '<td dir="ltr">' + escapeHtml(r.sender_phone) + "</td>" +
              "<td>" + fmt(r.amount) + "</td>" +
              '<td><span class="badge ' + meta.cls + '">' + meta.label + "</span></td>" +
              "<td>" + credited + "</td>" +
              "<td>" +
              '<button class="btn btn--primary btn--sm" type="button" data-act="approve"' + dis + ">اعتماد</button> " +
              '<button class="btn btn--outline btn--sm" type="button" data-act="review"' + dis + ">مراجعة</button> " +
              '<button class="btn btn--ghost btn--sm" type="button" data-act="reject"' + dis + ">رفض</button>" +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      });
  }

  function rechargeAction(id, action) {
    client()
      .rpc("admin_recharge_action", { p_id: Number(id), p_action: action })
      .then(function (res) {
        if (res.error || (res.data && res.data.ok === false)) {
          fail("تعذّر تنفيذ العملية.");
          return;
        }
        ok("تم تحديث الاستلام.");
        recharges();
      });
  }

  /* ——— الإعدادات: أرقام الاستقبال ——— */
  function settings() {
    const c = client();
    const tbody = el("receivers-body");
    if (!tbody) return;
    c.from("wallet_receivers")
      .select("id, company, phone, is_active, sort_order")
      .order("company", { ascending: true })
      .order("sort_order", { ascending: true })
      .then(function (res) {
        if (res.error) {
          tbody.innerHTML = '<tr><td colspan="5">تعذّر تحميل الأرقام.</td></tr>';
          return;
        }
        const rows = res.data || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5">لا توجد أرقام استقبال بعد.</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (r) {
            return (
              '<tr data-id="' + r.id + '">' +
              "<td>" + (COMPANY_LABEL[r.company] || r.company) + "</td>" +
              '<td><input class="input js-phone" type="tel" dir="ltr" style="max-width:150px" value="' + escapeHtml(r.phone) + '" /></td>' +
              '<td><input class="input js-sort" type="number" step="1" dir="ltr" style="max-width:80px" value="' + (r.sort_order == null ? 0 : r.sort_order) + '" /></td>' +
              '<td><input type="checkbox" class="js-active" ' + (r.is_active ? "checked" : "") + " /></td>" +
              "<td>" +
              '<button class="btn btn--outline btn--sm" type="button" data-act="save-receiver">حفظ</button> ' +
              '<button class="btn btn--ghost btn--sm" type="button" data-act="del-receiver">حذف</button>' +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      });
  }

  function addReceiver(form) {
    const company = el("rcv-company").value;
    const phone = el("rcv-phone").value.trim();
    if (window.Validators && window.Validators.lyPhone(phone) !== true) {
      window.UI.toast("أدخل رقمًا ليبيًا صحيحًا يبدأ بـ 09 (10 أرقام).", { type: "warning" });
      return;
    }
    client()
      .from("wallet_receivers")
      .insert({ company: company, phone: phone, is_active: true, sort_order: 0 })
      .then(function (res) {
        if (res.error) { fail("تعذّر إضافة الرقم."); return; }
        el("receiver-form").reset();
        ok("تمت إضافة رقم الاستقبال.");
        settings();
      });
  }

  function saveReceiver(id, row) {
    const phone = row.querySelector(".js-phone").value.trim();
    if (window.Validators && window.Validators.lyPhone(phone) !== true) {
      window.UI.toast("رقم غير صحيح.", { type: "warning" });
      return;
    }
    const patch = {
      phone: phone,
      sort_order: Number(row.querySelector(".js-sort").value) || 0,
      is_active: row.querySelector(".js-active").checked,
    };
    client()
      .from("wallet_receivers")
      .update(patch)
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حفظ الرقم."); return; }
        ok("تم حفظ الرقم.");
      });
  }

  function deleteReceiver(id) {
    if (!window.confirm("حذف رقم الاستقبال هذا؟")) return;
    client()
      .from("wallet_receivers")
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) { fail("تعذّر حذف الرقم."); return; }
        ok("تم حذف الرقم.");
        settings();
      });
  }

  /* ——— تغيير كلمة المرور ——— */
  function changePassword(form) {
    const pwd = (el("pwd-new") || {}).value || "";
    const conf = (el("pwd-confirm") || {}).value || "";
    if (pwd.length < 6) {
      window.UI.toast("كلمة المرور يجب أن تكون 6 أحرف على الأقل.", { type: "warning" });
      return;
    }
    if (pwd !== conf) {
      window.UI.toast("كلمتا المرور غير متطابقتين.", { type: "warning" });
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true);
    client()
      .auth.updateUser({ password: pwd })
      .then(function (res) {
        setBtnLoading(btn, false);
        if (res.error) { fail("تعذّر تغيير كلمة المرور."); return; }
        form.reset();
        ok("تم تغيير كلمة المرور.");
      })
      .catch(function () {
        setBtnLoading(btn, false);
        fail("تعذّر تغيير كلمة المرور.");
      });
  }

  /* ——— ربط SMS RAEED ——— */
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.classList.add("is-loading");
    } else {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  function applySmsraedStatus(s) {
    const base = el("smsraed-base");
    if (base && s.base_url) base.value = s.base_url;
    const en = el("smsraed-enabled");
    if (en) en.checked = !!s.enabled;
    const keyState = el("smsraed-key-state");
    if (keyState) {
      keyState.innerHTML = s.key_set
        ? '<span class="badge badge--success">المفتاح مضبوط ••••' +
          escapeHtml(s.key_hint || "") +
          "</span>"
        : '<span class="badge badge--danger">لا يوجد مفتاح</span>';
    }
    const enState = el("smsraed-enabled-state");
    if (enState) {
      enState.innerHTML = s.enabled
        ? '<span class="badge badge--success">مفعّل</span>'
        : '<span class="badge badge--muted">معطّل</span>';
    }
  }

  function refreshSmsraed() {
    client()
      .rpc("admin_smsraed_status")
      .then(function (res) {
        if (res.error || !res.data || res.data.ok === false) {
          fail("تعذّر جلب حالة الربط.");
          return;
        }
        applySmsraedStatus(res.data);
      });
  }

  function saveSmsraed(form) {
    const key = el("smsraed-key").value.trim();
    const base = el("smsraed-base").value.trim();
    const enabled = el("smsraed-enabled").checked;
    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true);
    client()
      .rpc("admin_smsraed_save", {
        p_api_key: key || null,
        p_base_url: base || null,
        p_enabled: enabled,
      })
      .then(function (res) {
        setBtnLoading(btn, false);
        if (res.error || !res.data || res.data.ok === false) {
          fail("تعذّر حفظ إعدادات الربط.");
          return;
        }
        el("smsraed-key").value = "";
        applySmsraedStatus(res.data);
        ok("تم حفظ إعدادات ربط SMS RAEED.");
      });
  }

  function clearSmsraedKey() {
    if (!window.confirm("مسح مفتاح SMS RAEED؟ لن يعمل الشحن حتى تضيف مفتاحًا جديدًا.")) return;
    client()
      .rpc("admin_smsraed_clear_key")
      .then(function (res) {
        if (res.error || !res.data || res.data.ok === false) {
          fail("تعذّر مسح المفتاح.");
          return;
        }
        applySmsraedStatus(res.data);
        ok("تم مسح المفتاح.");
      });
  }

  function testSmsraed() {
    const box = el("smsraed-test-result");
    if (box) box.textContent = "جارٍ اختبار الاتصال…";
    client()
      .rpc("admin_smsraed_test")
      .then(function (res) {
        if (res.error || !res.data || res.data.ok === false) {
          const code = res.data && res.data.error;
          if (box) box.textContent = code === "not_configured" ? "لا يوجد مفتاح مخزَّن." : "تعذّر بدء الاختبار.";
          return;
        }
        const rid = res.data.request_id;
        let tries = 0;
        const timer = setInterval(function () {
          tries++;
          client()
            .rpc("admin_smsraed_test_result", { p_id: rid })
            .then(function (r2) {
              if (r2 && r2.data && r2.data.found) {
                clearInterval(timer);
                if (box) {
                  box.textContent =
                    "رمز HTTP: " + r2.data.status_code + "\n" + (r2.data.body || "").slice(0, 400);
                }
              } else if (tries >= 8) {
                clearInterval(timer);
                if (box) box.textContent = "لم يصل رد بعد. تحقّق من الرابط والمفتاح والحساب على منصة SMS RAEED.";
              }
            });
        }, 700);
      });
  }

  /* ——— ربط الأحداث ——— */
  function wire() {
    const key = pageKey();

    if (key === "smsraed") {
      const form = el("smsraed-form");
      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          saveSmsraed(form);
        });
      }
      const clear = el("smsraed-clear");
      if (clear) clear.addEventListener("click", clearSmsraedKey);
      const test = el("smsraed-test");
      if (test) test.addEventListener("click", testSmsraed);
    }

    if (key === "providers") {
      const form = el("provider-form");
      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          addProvider(form);
        });
      }
      const sync = el("providers-sync");
      if (sync) {
        sync.addEventListener("click", function () {
          syncServices(sync);
        });
      }
      const tbody = el("providers-body");
      if (tbody) {
        tbody.addEventListener("click", function (e) {
          const btn = e.target.closest("[data-act]");
          if (!btn) return;
          const row = btn.closest("tr");
          const id = Number(row.getAttribute("data-id"));
          if (btn.getAttribute("data-act") === "save-provider") saveProvider(id, row);
          else if (btn.getAttribute("data-act") === "del-provider") deleteProvider(id);
        });
      }
    }

    if (key === "users") {
      const tbody = el("users-body");
      if (tbody) {
        tbody.addEventListener("click", function (e) {
          const btn = e.target.closest('[data-act="adjust"]');
          if (!btn) return;
          const row = btn.closest("tr");
          adjustBalance(row.getAttribute("data-id"), row.querySelector(".js-amount").value);
        });
      }
    }

    if (key === "services") {
      const tbody = el("services-body");
      if (tbody) {
        tbody.addEventListener("click", function (e) {
          const btn = e.target.closest("[data-act]");
          if (!btn) return;
          const row = btn.closest("tr");
          const id = Number(row.getAttribute("data-id"));
          if (btn.getAttribute("data-act") === "save-service") saveService(id, row);
          else if (btn.getAttribute("data-act") === "del-service") deleteService(id);
        });
      }
      const sync = el("services-sync");
      if (sync) {
        sync.addEventListener("click", function () {
          syncServices(sync);
        });
      }
      servicesPage = 1;
      loadServiceCategoryOptions();
      loadServiceProviderOptions();
      wireServicesFilters();
    }

    if (key === "orders") {
      const tbody = el("orders-body");
      if (tbody) {
        tbody.addEventListener("change", function (e) {
          const sel = e.target.closest(".js-order-status");
          if (!sel) return;
          updateOrderStatus(Number(sel.closest("tr").getAttribute("data-id")), sel.value);
        });
      }
    }

    if (key === "recharges") {
      const tbody = el("recharges-body");
      if (tbody) {
        tbody.addEventListener("click", function (e) {
          const btn = e.target.closest("[data-act]");
          if (!btn || btn.disabled) return;
          const act = btn.getAttribute("data-act");
          if (act === "approve" || act === "review" || act === "reject") {
            rechargeAction(Number(btn.closest("tr").getAttribute("data-id")), act);
          }
        });
      }
    }

    if (key === "settings") {
      const form = el("receiver-form");
      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          addReceiver(form);
        });
      }
      const pwdForm = el("password-form");
      if (pwdForm) {
        pwdForm.addEventListener("submit", function (e) {
          e.preventDefault();
          changePassword(pwdForm);
        });
      }
      const tbody = el("receivers-body");
      if (tbody) {
        tbody.addEventListener("click", function (e) {
          const btn = e.target.closest("[data-act]");
          if (!btn) return;
          const row = btn.closest("tr");
          const id = Number(row.getAttribute("data-id"));
          if (btn.getAttribute("data-act") === "save-receiver") saveReceiver(id, row);
          else if (btn.getAttribute("data-act") === "del-receiver") deleteReceiver(id);
        });
      }
    }
  }

  const MODULES = {
    dashboard: dashboard,
    users: users,
    providers: providers,
    services: services,
    orders: orders,
    recharges: recharges,
    settings: settings,
    smsraed: refreshSmsraed,
  };

  function loadProfiles() {
    return client()
      .from("profiles")
      .select("id, email, full_name")
      .then(function (res) {
        ((res && res.data) || []).forEach(function (p) {
          profilesMap[p.id] = p;
        });
      })
      .catch(function () {});
  }

  function start() {
    if (started) return;
    started = true;
    buildShell();
    wire();
    guard().then(function (allowed) {
      if (!allowed) return;
      loadProfiles().then(function () {
        const run = MODULES[pageKey()];
        if (run) run();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", buildShell);
  document.addEventListener("session:changed", start);
})();
