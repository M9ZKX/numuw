/*
  main.js
  السلوك العام المشترك بين كل الصفحات: قائمة الهاتف، تمييز الرابط النشط،
  سنة حقوق النشر، وكشف العناصر عند التمرير.
*/

(function () {
  "use strict";

  /* ——— قائمة الهاتف ——— */
  function initNavToggle() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("primary-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    }

    toggle.addEventListener("click", function () {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!isOpen);
    });

    // إغلاق عند الضغط على رابط
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    // إغلاق بمفتاح Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    // إغلاق عند النقر خارج القائمة
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });

    // إغلاق عند التبديل إلى عرض الحاسوب
    const desktopQuery = window.matchMedia("(min-width: 861px)");
    const onBreakpoint = function (e) {
      if (e.matches) setOpen(false);
    };
    if (desktopQuery.addEventListener) {
      desktopQuery.addEventListener("change", onBreakpoint);
    } else if (desktopQuery.addListener) {
      desktopQuery.addListener(onBreakpoint);
    }
  }

  /* ——— تمييز الرابط النشط حسب اسم الملف ——— */
  function initActiveLink() {
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav__link").forEach(function (link) {
      const href = link.getAttribute("href");
      if (!href) return;
      const target = href.split("/").pop();
      if (target === path) link.setAttribute("aria-current", "page");
    });
  }

  /* ——— سنة حقوق النشر ——— */
  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ——— كشف العناصر عند التمرير (مرة واحدة) ——— */
  function initReveal() {
    const items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach((el) => observer.observe(el));
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNavToggle();
    initActiveLink();
    initYear();
    initReveal();
  });
})();
