/**
 * IBS Website Global JavaScript
 * Features: Mobile nav, smooth scroll, animations, form validation, services tabs, testimonials slider
 */

document.addEventListener('DOMContentLoaded', function() {
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const year = document.getElementById('year');

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem('ibs-theme');
    } catch (error) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem('ibs-theme', theme);
    } catch (error) {}
  }

  let currentTheme = getStoredTheme() || root.getAttribute('data-theme') || 'dark';

  function applyTheme(theme) {
    currentTheme = theme;
    root.setAttribute('data-theme', theme);
    storeTheme(theme);

    if (!themeToggle) return;

    const sunIcon = themeToggle.querySelector('.sun-icon');
    const moonIcon = themeToggle.querySelector('.moon-icon');

    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');

    if (sunIcon) sunIcon.classList.toggle('hidden', theme === 'light');
    if (moonIcon) moonIcon.classList.toggle('hidden', theme === 'dark');
  }

  applyTheme(currentTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
  }

  const header = document.querySelector('.site-header');

  function updateHeaderState() {
    if (header) {
      header.classList.toggle('scrolled', window.scrollY > 20);
    }
  }

  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });

  function animateCounter(element) {
    if (element.dataset.counted === 'true') return;

    element.dataset.counted = 'true';

    const target = Number(element.dataset.target || 0);
    const suffix = element.dataset.suffix || '';
    const duration = 1600;
    const startTime = performance.now();

    function updateCounter(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * easedProgress);

      element.textContent = value.toLocaleString('en-US') + suffix;

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        element.textContent = target.toLocaleString('en-US') + suffix;
      }
    }

    requestAnimationFrame(updateCounter);
  }

  const counters = document.querySelectorAll('.counter');

  if (counters.length) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.45 });

    counters.forEach(counter => counterObserver.observe(counter));
  }

  // Inject shared hamburger styles so icon animation works on every page.
  (function injectHamburgerStyles() {
    const styleId = 'ibs-hamburger-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .hamburger span {
        display: block;
        width: 28px;
        height: 3px;
        background: #ffffff;
        margin: 5px 0;
        transition: 0.3s;
        border-radius: 9999px;
      }
      .hamburger.active span:nth-child(1) { transform: rotate(-45deg) translate(-6px, 7px); }
      .hamburger.active span:nth-child(2) { opacity: 0; }
      .hamburger.active span:nth-child(3) { transform: rotate(45deg) translate(-6px, -7px); }
    `;
    document.head.appendChild(style);
  })();

  // Mobile Nav Toggle
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.nav-menu');

  
  if (hamburger && navMenu) {
    // Ensure mobile menu starts hidden
    // (Desktop links are handled by Tailwind's `hidden md:flex`.)
    navMenu.classList.add('hidden');

    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      // Toggle visibility for mobile only
      const isHidden = navMenu.classList.contains('hidden');
      navMenu.classList.toggle('hidden');
      navMenu.classList.toggle('active');

      if (isHidden) {
        // When opening, remove hidden state and ensure active is set
        navMenu.classList.remove('hidden');
        navMenu.classList.add('active');
      } else {
        // When closing
        navMenu.classList.add('hidden');
        navMenu.classList.remove('active');
      }
    });

    // Close menu on link click
    document.querySelectorAll('.nav-menu a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.add('hidden');
        navMenu.classList.remove('active');
      });
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
        hamburger.classList.remove('active');
        navMenu.classList.add('hidden');
        navMenu.classList.remove('active');
      }
    });
  }


  // Smooth Scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Scroll Reveal Animation
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fadeInUp');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });

  // Services Tabs (for services.html)



  const serviceTabs = document.querySelectorAll('.service-tab');
  const serviceContents = document.querySelectorAll('.service-content');
  
  serviceTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      serviceContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      serviceContents[index].classList.add('active');
    });
  });

  // Testimonials Slider (for about.html)
  let currentSlide = 0;
  const slides = document.querySelectorAll('.testimonial-slide');
  const totalSlides = slides.length;
  const sliderNav = document.querySelector('.slider-nav');

  if (slides.length > 1) {
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % totalSlides;
      slides[currentSlide].classList.add('active');
    }, 5000);

    // Nav dots
    sliderNav.innerHTML = slides.map((_, i) => `<button class="nav-dot ${i===0 ? 'active' : ''}" data-slide="${i}"></button>`).join('');
    
    document.querySelectorAll('.nav-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        slides[currentSlide].classList.remove('active');
        currentSlide = parseInt(dot.dataset.slide);
        slides[currentSlide].classList.add('active');
        document.querySelectorAll('.nav-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });
  }

  // Hero Scroll Indicator
  const hero = document.querySelector('.hero');
  if (hero) {
    let scrollIndicator = hero.querySelector('.scroll-indicator');

    if (!scrollIndicator) {
      scrollIndicator = document.createElement('button');
      scrollIndicator.type = 'button';
      scrollIndicator.innerHTML = '⌄';
      scrollIndicator.className = 'scroll-indicator';
      hero.appendChild(scrollIndicator);
    }
    
    scrollIndicator.addEventListener('click', () => {
      document.querySelector('#services')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // FAQ Accordion
  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
      const answer = button.nextElementSibling;
      const icon = button.querySelector('.faq-icon');

      // Toggle current answer
      answer.classList.toggle('hidden');
      icon.textContent = answer.classList.contains('hidden') ? '+' : '−';
      icon.classList.toggle('rotate-180');
    });
  });
});

