/*
  auth.js
  الدخول وإنشاء الحساب عبر حساب Google فقط (Supabase OAuth).

  لا توجد نماذج بريد أو كلمة مرور: زر واحد يبدأ تدفّق OAuth لدى Supabase،
  ويعود بعدها المستخدم إلى صفحة المحفظة بجلسة جاهزة. الحساب يُنشأ تلقائيًا
  عند أول دخول.
*/

(function () {
  "use strict";

  const REDIRECT_AFTER_LOGIN = "wallet.html";
  const PROVIDER = "google";

  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    } else {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.disabled = false;
    }
  }

  function authUnavailableToast() {
    window.UI.toast(
      "تعذّر الاتصال بخدمة المصادقة. تأكد من اتصالك بالإنترنت ثم أعد تحميل الصفحة.",
      { type: "danger", title: "تعذّر الاتصال", duration: 7000 }
    );
  }

  function startGoogleAuth(btn) {
    const client = window.SupabaseClient;
    if (!client || !client.auth) {
      authUnavailableToast();
      return;
    }

    setLoading(btn, true);
    const redirectTo = location.origin + "/" + REDIRECT_AFTER_LOGIN;

    client.auth
      .signInWithOAuth({
        provider: PROVIDER,
        options: { redirectTo: redirectTo },
      })
      .then(function (res) {
        if (res && res.error) {
          setLoading(btn, false);
          window.UI.toast(
            "تعذّر بدء الدخول عبر Google. حاول مرة أخرى بعد قليل.",
            { type: "danger", title: "تعذّر الدخول", duration: 7000 }
          );
        }
        // عند النجاح ينتقل المتصفح إلى Google مباشرة، فلا حاجة لإجراء آخر.
      })
      .catch(function () {
        setLoading(btn, false);
        authUnavailableToast();
      });
  }

  function bindGoogleButton(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      startGoogleAuth(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindGoogleButton("google-login");
    bindGoogleButton("google-register");
  });
})();
