/*
  settings.js
  منطق صفحة الإعدادات.

  تغيير الواجهة (فاتح/داكن) محلي فقط. نموذج معلومات الحساب يعرض بيانات
  الجلسة الحقيقية القادمة من Supabase Auth، أما حفظ تعديلاته وبقية
  الإعدادات فغير مفعّل بعد.
*/

(function () {
  "use strict";

  const THEME_KEY = "numuw-theme";

  /* ——— السمة (فاتح/داكن) ——— */
  function initThemeToggle() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;

    // مزامنة الحالة مع السمة الحالية
    let current = "light";
    try {
      current = localStorage.getItem(THEME_KEY) || "light";
    } catch (e) {}
    const isDark = current === "dark";
    toggle.checked = isDark;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );

    toggle.addEventListener("change", function () {
      const theme = toggle.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {}
      window.UI.toast(
        theme === "dark" ? "تم تفعيل الوضع الداكن." : "تم تفعيل الوضع الفاتح.",
        { type: "success", duration: 2500 }
      );
    });
  }

  /* ——— عناصر أولية غير مفعّلة ——— */
  function initPlaceholderControls() {
    document.querySelectorAll("[data-placeholder-control]").forEach(function (el) {
      el.addEventListener("change", function () {
        window.UI.toast("هذا الإعداد غير متاح حاليًا.", {
          type: "info",
          title: "قريبًا",
          duration: 4000,
        });
      });
    });
  }

  /* ——— نموذج معلومات الحساب ——— */
  function initAccountForm() {
    const form = document.getElementById("account-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      setTimeout(function () {
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-busy");
        window.UI.toast(
          "حفظ بيانات الحساب غير متاح حاليًا.",
          { type: "info", title: "غير متاح", duration: 5000 }
        );
      }, 900);
    });
  }

  /* ——— معلومات الحساب من الجلسة الحقيقية ——— */
  function renderAccount(session) {
    const name = document.getElementById("account-name");
    const email = document.getElementById("account-email");
    const uid = document.getElementById("account-uid");
    const created = document.getElementById("account-created");
    const status = document.getElementById("account-status");
    if (!name || !email) return;

    const user = session ? session.user : null;
    if (!user) {
      name.value = "";
      email.value = "";
      if (uid) uid.textContent = "—";
      if (created) created.textContent = "—";
      return;
    }

    const meta = user.user_metadata || {};
    name.value = meta.full_name || meta.name || "";
    email.value = user.email || "";
    if (uid) uid.textContent = user.id || "—";
    if (created) {
      created.textContent = user.created_at
        ? String(user.created_at).slice(0, 10)
        : "—";
    }
    if (status) {
      const confirmed =
        user.email_confirmed_at || user.confirmed_at || null;
      status.innerHTML = confirmed
        ? '<span class="badge badge--success">مؤكَّد</span>'
        : '<span class="badge badge--warning">بانتظار التأكيد</span>';
    }
  }

  /* ——— تسجيل الخروج ——— */
  function initLogout() {
    const btn = document.getElementById("logout-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (window.AppAuth) window.AppAuth.signOut();
    });
  }

  /* ——— تعبئة نموذج الحساب عند توفّر الجلسة ——— */
  function initAccountSession() {
    renderAccount(window.AppSession && window.AppSession.session);
    document.addEventListener("session:changed", function (e) {
      renderAccount(e.detail ? e.detail.session : null);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initThemeToggle();
    initPlaceholderControls();
    initAccountForm();
    initAccountSession();
    initLogout();
  });
})();
