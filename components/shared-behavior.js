/* ==========================================================================
   IBS shared behaviour. Replaces all previous per-page chrome scripts and
   the browser-side footer injector. Every lookup is guarded so a missing
   optional element never throws. Handles: header menu, services dropdown,
   floating WhatsApp, back-to-top, footer year, FAQ accordions, runtime
   FAQPage schema (only when no static one exists) and the contact form.
   ========================================================================== */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- Footer year ---------- */
    var yearNow = String(new Date().getFullYear());
    ["ibs-year", "year"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = yearNow;
    });

    /* ---------- Header mobile menu ---------- */
    var menuButton = document.getElementById("ibs-menu-toggle");
    var navigation = document.getElementById("ibs-navigation");

    function closeMenu() {
      if (!navigation || !menuButton) return;
      navigation.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open navigation");
    }

    if (menuButton && navigation) {
      menuButton.addEventListener("click", function () {
        var open = navigation.classList.toggle("is-open");
        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      });

      navigation.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });

      document.addEventListener("click", function (event) {
        if (!event.target.closest(".ibs-header")) {
          closeMenu();
          closeDropdowns();
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closeMenu();
          closeDropdowns();
        }
      });

      window.addEventListener("resize", function () {
        if (window.innerWidth > 820) closeMenu();
      });
    }

    /* ---------- Services dropdown (<details>) ---------- */
    function closeDropdowns() {
      document.querySelectorAll(".ibs-nav-dropdown[open]").forEach(function (d) {
        d.open = false;
      });
    }

    document.querySelectorAll(".ibs-nav-dropdown").forEach(function (details) {
      details.addEventListener("toggle", function () {
        if (details.open) {
          document.querySelectorAll(".ibs-nav-dropdown[open]").forEach(function (other) {
            if (other !== details) other.open = false;
          });
        }
      });
    });

    /* ---------- Floating WhatsApp ---------- */
    var whatsapp = document.getElementById("ibs-whatsapp");
    if (whatsapp) {
      function updateWhatsApp() {
        whatsapp.classList.toggle("is-visible", window.scrollY > 350);
      }
      window.addEventListener("scroll", updateWhatsApp, { passive: true });
      window.addEventListener("resize", updateWhatsApp);
      updateWhatsApp();
    }

    /* ---------- Back to top ---------- */
    var backTop = document.getElementById("ibs-back-top");
    if (backTop) {
      function updateBackTop() {
        backTop.classList.toggle("is-visible", window.scrollY > 500);
      }
      window.addEventListener("scroll", updateBackTop, { passive: true });
      window.addEventListener("resize", updateBackTop);
      updateBackTop();

      backTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      });
    }

    /* ---------- FAQ accordion (details based) ---------- */
    var faqNodes = document.querySelectorAll(".faq-item, .ibs-faq-item");
    faqNodes.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        faqNodes.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });

    /* ---------- Runtime FAQPage schema (only if none is static) ---------- */
    var hasStaticFaq = false;
    document.querySelectorAll("script[type=\"application/ld+json\"]").forEach(function (s) {
      if (s.textContent.indexOf("FAQPage") !== -1) hasStaticFaq = true;
    });

    if (!hasStaticFaq) {
      var schemaItems = [];
      document.querySelectorAll(".faq-item").forEach(function (item) {
        var summary = item.querySelector("summary");
        var answer = item.querySelector(".faq-answer");
        if (!summary || !answer) return;
        var questionText = summary.textContent.replace(/\s+/g, " ").trim();
        var answerText = answer.textContent.replace(/\s+/g, " ").trim();
        if (!questionText || !answerText) return;
        schemaItems.push({
          "@type": "Question",
          name: questionText,
          acceptedAnswer: { "@type": "Answer", text: answerText }
        });
      });

      if (schemaItems.length) {
        var faqScript = document.createElement("script");
        faqScript.type = "application/ld+json";
        faqScript.textContent = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: schemaItems
        });
        document.head.appendChild(faqScript);
      }
    }

    /* ---------- Contact form (contact.html) ---------- */
    var form = document.getElementById("contactForm");
    if (form) {
      var status = document.getElementById("formStatus");
      var submitButton = document.getElementById("submitButton");
      var submitLabel = document.getElementById("submitLabel");
      var submitting = false;

      function showStatus(message, state) {
        if (!status) return;
        status.textContent = message;
        status.dataset.state = state;
      }

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (submitting || !form.reportValidity()) return;

        var data = new FormData(form);
        var payload = {
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          service: String(data.get("service") || "").trim(),
          message: String(data.get("message") || "").trim()
        };

        if (!payload.name || !payload.phone || !payload.service) {
          showStatus("Please enter your name, phone number and selected service.", "error");
          return;
        }

        submitting = true;
        if (submitButton) submitButton.disabled = true;
        if (submitLabel) submitLabel.textContent = "Sending...";
        form.setAttribute("aria-busy", "true");
        showStatus("Sending your enquiry...", "pending");

        try {
          var response = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          var result = await response.json().catch(function () { return null; });

          if (!response.ok || (result && result.success === false)) {
            throw new Error((result && result.message) || "Unable to send your enquiry. Please try again or call us.");
          }
          if (!result) {
            throw new Error("We could not confirm your submission. Please call us.");
          }

          showStatus("Thank you. An IBS specialist will contact you shortly.", "success");
          form.reset();
        } catch (error) {
          showStatus((error && error.message) || "Something went wrong. Please try again or call 0332-3070499.", "error");
        } finally {
          submitting = false;
          if (submitButton) submitButton.disabled = false;
          if (submitLabel) submitLabel.textContent = "Request Free Inspection";
          form.removeAttribute("aria-busy");
        }
      });
    }

    /* ---------- Optional widgets (homepage / about) ---------- */

    /* Animated counters */
    var counters = document.querySelectorAll(".counter");
    if (counters.length) {
      function animateCounter(element) {
        if (element.dataset.counted === "true") return;
        element.dataset.counted = "true";
        var target = Number(element.dataset.target || 0);
        var suffix = element.dataset.suffix || "";
        var duration = 1600;
        var startTime = performance.now();
        function step(now) {
          var progress = Math.min((now - startTime) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          element.textContent = Math.round(target * eased).toLocaleString("en-US") + suffix;
          if (progress < 1) requestAnimationFrame(step);
          else element.textContent = target.toLocaleString("en-US") + suffix;
        }
        requestAnimationFrame(step);
      }
      var counterObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.45 });
      counters.forEach(function (c) { counterObserver.observe(c); });
    }

    /* Testimonials slider (about.html) */
    var slides = document.querySelectorAll(".testimonial-slide");
    var sliderNav = document.querySelector(".slider-nav");
    if (slides.length > 1) {
      var currentSlide = 0;
      function showSlide(index) {
        slides[currentSlide].classList.remove("active");
        currentSlide = index;
        slides[currentSlide].classList.add("active");
        document.querySelectorAll(".nav-dot").forEach(function (d, i) {
          d.classList.toggle("active", i === currentSlide);
        });
      }
      if (sliderNav) {
        sliderNav.innerHTML = Array.prototype.map.call(slides, function (_, i) {
          return "<button class=\"nav-dot" + (i === 0 ? " active" : "") + "\" type=\"button\" data-slide=\"" + i + "\" aria-label=\"Go to slide " + (i + 1) + "\"></button>";
        }).join("");
        sliderNav.querySelectorAll(".nav-dot").forEach(function (dot) {
          dot.addEventListener("click", function () { showSlide(parseInt(dot.dataset.slide, 10)); });
        });
      }
      setInterval(function () { showSlide((currentSlide + 1) % slides.length); }, 5000);
    }

    /* Hero scroll indicator (homepage) */
    var hero = document.querySelector(".ibs-hero");
    if (hero && !hero.querySelector(".scroll-indicator")) {
      var indicator = document.createElement("button");
      indicator.type = "button";
      indicator.className = "scroll-indicator";
      indicator.setAttribute("aria-label", "Scroll to services");
      indicator.textContent = "\u2335";
      hero.appendChild(indicator);
      indicator.addEventListener("click", function () {
        var services = document.getElementById("services");
        if (services) services.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
      });
    }
  });
})();
