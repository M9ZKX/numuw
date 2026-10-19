/*
  auth-session.js
  حالة تسجيل الدخول المشتركة بين كل الصفحات.

  مسؤوليات هذا الملف:
  - معرفة ما إذا كان هناك جلسة نشطة (عبر عميل Supabase).
  - تحويل مجموعة روابط الدخول في الترويسة إلى هوية المستخدم مع زر خروج.
  - حماية الصفحات الخاصة (المحفظة والإعدادات) بإعادة الزائر إلى صفحة الدخول.
  - تزويذ باقي الوحدات بجلسة المستخدم عبر window.AppSession.

  لا يُنفّذ تسجيل الدخول أو إنشاء الحساب هنا؛ ذلك في auth.js.
*/

(function () {
  "use strict";

  const PRIVATE_PAGES = ["wallet.html", "settings.html", "admin.html"];

  window.AppSession = {
    user: null,
    session: null,
    ready: false,
  };

  /* ——— أدوات ——— */
  function pageName() {
    return location.pathname.split("/").pop() || "index.html";
  }

  function isPrivatePage() {
    return PRIVATE_PAGES.indexOf(pageName()) !== -1;
  }

  function displayName(user) {
    if (!user) return "";
    const meta =
      (user.user_metadata && user.user_metadata.full_name) ||
      (user.user_metadata && user.user_metadata.name);
    if (meta) return meta;
    if (user.email) return user.email;
    return "حسابك";
  }

  /* ——— تحديث الترويسة ——— */
  function renderNav(state) {
    const actions = document.querySelector(".nav__actions");
    if (!actions) return;

    if (!state.authenticated) {
      actions.removeAttribute("data-auth");
      actions.innerHTML =
        '<a class="btn btn--ghost" href="login.html">تسجيل الدخول</a>' +
        '<a class="btn btn--primary" href="register.html">إنشاء حساب</a>';
      return;
    }

    actions.setAttribute("data-auth", "in");
    actions.innerHTML = "";

    const account = document.createElement("a");
    account.className = "btn btn--ghost nav__account";
    account.href = "settings.html";
    account.innerHTML = "";
    const icon = document.createElement("span");
    icon.setAttribute("data-icon", "user");
    icon.setAttribute("data-icon-size", "18");
    const label = document.createElement("span");
    label.textContent = displayName(state.user);
    account.appendChild(icon);
    account.appendChild(label);

    const out = document.createElement("button");
    out.className = "btn btn--outline nav__logout";
    out.type = "button";
    out.innerHTML = "";
    const outIcon = document.createElement("span");
    outIcon.setAttribute("data-icon", "logout");
    outIcon.setAttribute("data-icon-size", "18");
    const outLabel = document.createElement("span");
    outLabel.textContent = "خروج";
    out.appendChild(outIcon);
    out.appendChild(outLabel);
    out.addEventListener("click", function () {
      signOut();
    });

    actions.appendChild(account);
    actions.appendChild(out);

    if (window.Icons && window.Icons.hydrateIcons) {
      window.Icons.hydrateIcons(actions);
    }
  }

  /* ——— رابط الإدارة (للمشرفين فقط) ——— */
  function syncAdminLink() {
    const list = document.querySelector(".nav__links");
    if (!list) return;

    const session = window.AppSession.session;
    const existing = list.querySelector("[data-admin-link]");

    if (!session || !window.SupabaseClient) {
      if (existing) existing.remove();
      return;
    }

    window.SupabaseClient.from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(function (res) {
        const isAdmin =
          res && !res.error && res.data && res.data.role === "admin";
        const current = list.querySelector("[data-admin-link]");
        if (isAdmin && !current) {
          const li = document.createElement("li");
          li.setAttribute("data-admin-link", "");
          const a = document.createElement("a");
          a.className = "nav__link";
          a.href = "admin.html";
          a.textContent = "الإدارة";
          li.appendChild(a);
          list.appendChild(li);
        } else if (!isAdmin && current) {
          current.remove();
        }
      });
  }

  /* ——— تسجيل الخروج ——— */
  function signOut() {
    const client = window.SupabaseClient;
    const finish = function () {
      window.AppSession.user = null;
      window.AppSession.session = null;
      renderNav({ authenticated: false });
      syncAdminLink();
      if (window.UI) {
        window.UI.toast("تم تسجيل الخروج من حسابك.", {
          type: "info",
          title: "خروج",
        });
      }
      if (isPrivatePage()) {
        location.replace("login.html");
      }
    };

    if (!client || !client.auth) {
      finish();
      return;
    }

    client.auth.signOut().then(finish).catch(finish);
  }

  /* ——— حماية الصفحات الخاصة ——— */
  function guardPrivatePage() {
    if (!isPrivatePage()) return;
    if (window.AppSession.user) return;
    location.replace("login.html");
  }

  /* ——— بدء التتبع ——— */
  function start() {
    const client = window.SupabaseClient;
    if (!client || !client.auth) return;

    client.auth.getSession().then(function (res) {
      const session = res && res.data ? res.data.session : null;
      window.AppSession.session = session || null;
      window.AppSession.user = session ? session.user : null;
      window.AppSession.ready = true;
      renderNav({ authenticated: Boolean(session), user: session && session.user });
      guardPrivatePage();
      syncAdminLink();
      document.dispatchEvent(
        new CustomEvent("session:changed", { detail: window.AppSession })
      );
    });

    client.auth.onAuthStateChange(function (_event, session) {
      window.AppSession.session = session || null;
      window.AppSession.user = session ? session.user : null;
      renderNav({ authenticated: Boolean(session), user: session && session.user });
      guardPrivatePage();
      syncAdminLink();
      document.dispatchEvent(
        new CustomEvent("session:changed", { detail: window.AppSession })
      );
    });
  }

  document.addEventListener("supabase:ready", start);

  document.addEventListener("supabase:unavailable", function () {
    window.AppSession.ready = true;
    renderNav({ authenticated: false });
    guardPrivatePage();
    syncAdminLink();
    document.dispatchEvent(
      new CustomEvent("session:changed", { detail: window.AppSession })
    );
  });

  window.AppAuth = { signOut: signOut, displayName: displayName };
})();
