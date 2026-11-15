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
    var whatsappPopup = document.getElementById("ibs-whatsapp-popup");
    if (whatsapp && whatsappPopup) {
      whatsapp.addEventListener("click", function () {
        var open = whatsapp.classList.toggle("is-open");
        whatsappPopup.hidden = !open;
        whatsapp.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && whatsapp.classList.contains("is-open")) {
          whatsapp.classList.remove("is-open");
          whatsappPopup.hidden = true;
          whatsapp.setAttribute("aria-expanded", "false");
        }
      });
    }

    /* ---------- Header state: dark pill locked, logo adapts ---------- */
    /* The nav pill stays dark with white links at every scroll position.
       The logo flips on its own: white when the background behind it is
       dark, dark when it is light. We sample the rendered background
       under the logo (via elementsFromPoint) and classify it by
       luminance; photos are sampled pixel-by-pixel, with a precomputed
       average-luminance map as the fallback. */
    var IBS_IMG_LUM = {"/assets/Insugreenlogo.webp":0.797,"/assets/Pest Control logo.webp":0.001,"/assets/TermiteProofinglogo.webp":0.75,"/assets/ali akbar groups.webp":0.265,"/assets/calendar-monsoon.webp":0.302,"/assets/calendar-post-monsoon.webp":0.311,"/assets/calendar-pre-monsoon.webp":0.168,"/assets/cause-aging-buildings.webp":0.267,"/assets/cause-bathroom-tank-leaks.webp":0.199,"/assets/cause-monsoon-rain.webp":0.053,"/assets/cause-poor-drainage.webp":0.135,"/assets/cause-rising-damp.webp":0.527,"/assets/cause-roof-seepage.webp":0.633,"/assets/facebook-icon.webp":0.026,"/assets/finder-roof-leak.webp":0.157,"/assets/friends-environmental-solutions.webp":0.345,"/assets/herosection.2.webp":0.093,"/assets/herosectionimg.webp":0.337,"/assets/ibs-logo-header.webp":0.024,"/assets/ibs-logo.webp":0.008,"/assets/karachi-problem-flood.webp":0.236,"/assets/logo-instagram.webp":0.359,"/assets/pest-bed-bug.webp":0.406,"/assets/pest-cockroach.webp":0.746,"/assets/pest-commercial-spray.webp":0.163,"/assets/pest-rat.webp":0.139,"/assets/pest-residential-spray.webp":0.259,"/assets/pest-technician.webp":0.093,"/assets/problem-bathroom-leak.webp":0.364,"/assets/problem-cockroach.webp":0.153,"/assets/problem-damp-wall.webp":0.237,"/assets/problem-heat.webp":0.547,"/assets/problem-roof-leak.webp":0.442,"/assets/problem-termite-damage.webp":0.062,"/assets/standing-water-tank.webp":0.271,"/assets/termite-barrier-spray.webp":0.296,"/assets/termite-frass.webp":0.141,"/assets/termite-house-damage.webp":0.155,"/assets/termite-shed-wings.webp":0.636,"/assets/termite-soil-treatment.webp":0.277,"/assets/termite-tubes.webp":0.324,"/assets/termite-wood-damage.webp":0.256,"/assets/thermal-cold-storage.webp":0.175,"/assets/thermal-commercial-roof.webp":0.088,"/assets/thermal-residential-roof.webp":0.061,"/assets/thermal-roof-install.webp":0.133,"/assets/waterproofing logo.webp":0.667,"/assets/whatsapp-logo.webp":0.367,"/assets/ibs/bathroom-leak.webp":0.269,"/assets/ibs/bathroom.webp":0.446,"/assets/ibs/ceiling-stain.webp":0.323,"/assets/ibs/concrete-cracks.webp":0.217,"/assets/ibs/foundation.webp":0.198,"/assets/ibs/hero-basement.webp":0.06,"/assets/ibs/hero-peb.webp":0.284,"/assets/ibs/hero-roof.webp":0.283,"/assets/ibs/hero-tank.webp":0.179,"/assets/ibs/hero-washroom.webp":0.139,"/assets/ibs/peeling-paint.webp":0.216,"/assets/ibs/pool.webp":0.306};
    function ibsRelLum(r, g, b) {
      function ch(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    }
    function ibsColorLum(color) {
      var m = color && color.match(/rgba?\(([^)]+)\)/);
      if (!m) return 1;
      var p = m[1].split(",");
      return ibsRelLum(parseFloat(p[0]) || 0, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0);
    }
    function ibsImageLum(url) {
      try {
        var path = new URL(url, location.href).pathname;
        if (IBS_IMG_LUM[path] != null) return IBS_IMG_LUM[path];
        var file = path.split("/").pop();
        for (var k in IBS_IMG_LUM) { if (k.split("/").pop() === file) return IBS_IMG_LUM[k]; }
      } catch (e) { /* fall through to the default below */ }
      return 0.3; /* unknown photo: assume dark */
    }
    /* Sample the actual pixels under a point inside an <img> (object-fit:
       cover). An image's average brightness can lie — e.g. a roof photo
       whose top is bright sky — so for photos we read the real pixels
       behind the logo. Returns null to fall back to the average map
       (zoomed hero slides, unloaded images, anything unexpected). */
    var ibsLumCache = {};
    function ibsCanvasLum(img, px, py) {
      try {
        if (!img.naturalWidth || !img.naturalHeight) return null;
        var cs = getComputedStyle(img);
        if ((cs.objectFit || "cover") !== "cover") return null;
        if (cs.transform && cs.transform !== "none") return null;
        var src = img.currentSrc || img.src;
        var entry = ibsLumCache[src];
        if (entry === false) return null;
        if (!entry) {
          var scale = Math.min(1, 320 / img.naturalWidth);
          var cw = Math.max(1, Math.round(img.naturalWidth * scale));
          var ch = Math.max(1, Math.round(img.naturalHeight * scale));
          var cv = document.createElement("canvas");
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext("2d");
          if (!ctx) { ibsLumCache[src] = false; return null; }
          ctx.drawImage(img, 0, 0, cw, ch);
          entry = { canvas: cv, w: cw, h: ch };
          ibsLumCache[src] = entry;
        }
        var r = img.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        var nw = img.naturalWidth, nh = img.naturalHeight;
        var s = Math.max(r.width / nw, r.height / nh);
        var pos = (cs.objectPosition || "50% 50%").split(" ");
        var posX = parseFloat(pos[0]); posX = isNaN(posX) ? 50 : posX;
        var posY = parseFloat(pos[1]); posY = isNaN(posY) ? 50 : posY;
        var ox = (r.width - nw * s) * (posX / 100);
        var oy = (r.height - nh * s) * (posY / 100);
        var sx = (px - r.left - ox) / s;
        var sy = (py - r.top - oy) / s;
        if (sx < 0 || sy < 0 || sx >= nw || sy >= nh) return null;
        var ctx2 = entry.canvas.getContext("2d");
        var kx = Math.round(sx * (entry.w / nw));
        var ky = Math.round(sy * (entry.h / nh));
        var rad = 4;
        var x0 = Math.max(0, kx - rad), y0 = Math.max(0, ky - rad);
        var x1 = Math.min(entry.w, kx + rad + 1), y1 = Math.min(entry.h, ky + rad + 1);
        var data = ctx2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        var n = data.length / 4, sr = 0, sg = 0, sb = 0;
        for (var i = 0; i < data.length; i += 4) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
        return ibsRelLum(sr / n, sg / n, sb / n);
      } catch (e) { return null; }
    }
    function ibsBackgroundLumAt(x, y) {
      var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest && el.closest(".ibs-header, .ibs-topbar")) continue;
        var node = el;
        while (node && node !== document.documentElement) {
          if (node.tagName === "IMG") {
            var cl = ibsCanvasLum(node, x, y);
            return cl != null ? cl : ibsImageLum(node.currentSrc || node.src);
          }
          var cs = getComputedStyle(node);
          var bi = cs.backgroundImage;
          if (bi && bi !== "none") {
            var m = bi.match(/url\(["']?([^"')]+)["']?\)/);
            if (m) return ibsImageLum(m[1]);
          }
          var bg = cs.backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return ibsColorLum(bg);
          node = node.parentElement;
        }
        return 1;
      }
      return 1;
    }
    function updateHeaderState() {
      document.body.classList.add("ibs-js");
      document.body.classList.toggle("ibs-at-top", window.scrollY <= 10);
      var logo = document.querySelector(".ibs-header .ibs-logo");
      var logoDark = false;
      if (logo) {
        var r = logo.getBoundingClientRect();
        if (r.width && r.height) {
          logoDark = ibsBackgroundLumAt(r.left + r.width / 2, r.top + r.height / 2) < 0.5;
        }
      }
      document.body.classList.toggle("ibs-logo-on-dark", logoDark);
    }
    var ibsThemeTicking = false;
    function scheduleHeaderState() {
      if (ibsThemeTicking) return;
      ibsThemeTicking = true;
      requestAnimationFrame(function () { ibsThemeTicking = false; updateHeaderState(); });
    }
    window.addEventListener("scroll", scheduleHeaderState, { passive: true });
    window.addEventListener("resize", scheduleHeaderState);
    updateHeaderState();

    /* ---------- Back to top ---------- */
    var backTop = document.getElementById("ibs-back-top");
    if (backTop) {
      function updateBackTop() {
        backTop.classList.toggle("is-visible", window.scrollY > 300);
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
  });
})();
